import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory } from '@/lib/messaging';
import type { ChannelType } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/messaging/channels/[id]/connect
 *
 * Valida as credenciais do canal chamando o provider (ex: Resend) e grava o
 * status resultante (`connected` ou `error`). Usado por canais que não têm
 * handshake próprio (QR code / webhook de conexão), como email.
 */
export async function POST(req: Request, { params }: RouteParams) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id: channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials, settings')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Só email valida direto via API. WhatsApp/Instagram têm fluxo próprio
  // (QR code, webhook de conexão) e mantêm o comportamento anterior.
  if (channel.channel_type !== 'email') {
    await supabase
      .from('messaging_channels')
      .update({ status: 'connecting', updated_at: new Date().toISOString() })
      .eq('id', channelId)
      .eq('organization_id', profile.organization_id);
    return json({ status: 'connecting' });
  }

  let status: 'connected' | 'error' = 'error';
  let message: string | undefined;

  try {
    const provider = ChannelProviderFactory.createProvider(
      channel.channel_type as ChannelType,
      channel.provider
    );
    await provider.initialize({
      channelId: channel.id,
      channelType: channel.channel_type as ChannelType,
      provider: channel.provider,
      externalIdentifier: channel.external_identifier,
      credentials: channel.credentials as Record<string, string>,
      settings: (channel.settings ?? {}) as Record<string, unknown>,
    });

    const result = await provider.getStatus();
    status = result.status === 'connected' ? 'connected' : 'error';
    message = result.message;
  } catch (error) {
    console.error('[channels/connect] error:', error);
    message = error instanceof Error ? error.message : 'Falha ao conectar canal';
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('messaging_channels')
    .update({
      status,
      status_message: status === 'connected' ? null : message ?? null,
      ...(status === 'connected' ? { last_connected_at: now } : {}),
      updated_at: now,
    })
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id);

  if (updateError) {
    console.error('[channels/connect] update error:', updateError);
    return json({ error: 'Failed to update channel status' }, 500);
  }

  return json({ status, message });
}
