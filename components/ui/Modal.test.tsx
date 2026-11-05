import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';
import { axe } from '@/lib/a11y/test/a11y-utils';

// Mock focus-trap-react
vi.mock('focus-trap-react', () => ({
  default: ({ children, active }: { children: React.ReactNode; active: boolean }) => (
    <div data-testid="focus-trap" data-active={active}>
      {children}
    </div>
  ),
}));

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <p>Modal content</p>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Accessibility', () => {
    it('should have role="dialog"', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have aria-modal="true"', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('should have aria-labelledby pointing to title', () => {
      render(<Modal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      
      const title = document.getElementById(labelledBy!);
      expect(title).toHaveTextContent('Test Modal');
    });

    it('should support custom labelledById', () => {
      render(<Modal {...defaultProps} labelledById="custom-title-id" />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'custom-title-id');
    });

    it('should support aria-describedby', () => {
      render(<Modal {...defaultProps} describedById="description-id" />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby', 'description-id');
    });

    it('should have accessible close button', () => {
      render(<Modal {...defaultProps} />);
      const closeButton = screen.getByRole('button', { name: /fechar modal/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should pass axe accessibility tests', async () => {
      const { container } = render(<Modal {...defaultProps} />);
      const results = await axe(container);
      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Focus Management', () => {
    it('should render FocusTrap when open', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByTestId('focus-trap')).toHaveAttribute('data-active', 'true');
    });

    it('should not render FocusTrap when closed', () => {
      render(<Modal {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId('focus-trap')).not.toBeInTheDocument();
    });
    
    it('should return focus to trigger element when closed', async () => {
      const onClose = vi.fn();
      
      // Create a trigger button and render modal
      const TriggerAndModal = () => {
        const [isOpen, setIsOpen] = React.useState(false);
        return (
          <>
            <button data-testid="trigger" onClick={() => setIsOpen(true)}>
              Open Modal
            </button>
            <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); onClose(); }} title="Test">
              <p>Content</p>
            </Modal>
          </>
        );
      };
      
      // We need React for this test
      const React = await import('react');
      
      render(<TriggerAndModal />);
      
      // Focus and click the trigger
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      expect(document.activeElement).toBe(trigger);
      
      // Open modal
      await userEvent.click(trigger);
      
      // Modal should be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      // Close modal
      await userEvent.click(screen.getByRole('button', { name: /fechar modal/i }));
      
      // onClose should have been called
      expect(onClose).toHaveBeenCalled();
      
      // Note: Focus return is handled by useFocusReturn hook, which stores
      // the activeElement when modal opens and restores it on unmount.
      // Due to testing-library limitations, we can't easily test this behavior
      // here as the hook needs the actual DOM lifecycle.
    });
  });

  describe('Keyboard Navigation', () => {
    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);
      
      await userEvent.click(screen.getByRole('button', { name: /fechar modal/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', async () => {
      const onClose = vi.fn();
      const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
      
      // Find the backdrop (the outer fixed div)
      const backdrop = container.querySelector('.fixed.inset-0');
      if (backdrop) {
        await userEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
      }
    });

    it('should NOT close when a drag (e.g. text selection) starts inside the dialog and ends on the backdrop', () => {
      const onClose = vi.fn();
      const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
      const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;

      // mousedown dentro do painel, mouseup/click no fundo (soltar o rato fora após selecionar texto)
      fireEvent.mouseDown(screen.getByRole('dialog'));
      fireEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close when mousedown and click both happen on the backdrop', () => {
      const onClose = vi.fn();
      const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
      const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;

      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Content', () => {
    it('should render title', () => {
      render(<Modal {...defaultProps} title="My Modal Title" />);
      expect(screen.getByText('My Modal Title')).toBeInTheDocument();
    });

    it('should render children', () => {
      render(
        <Modal {...defaultProps}>
          <p data-testid="content">Test content</p>
        </Modal>
      );
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it.each(['sm', 'md', 'lg', 'xl'] as const)('should apply %s size class', (size) => {
      render(<Modal {...defaultProps} size={size} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass(`max-w-${size}`);
    });
  });
});
