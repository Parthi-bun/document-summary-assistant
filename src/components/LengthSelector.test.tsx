import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LengthSelector } from './LengthSelector';

describe('LengthSelector', () => {
  it('renders all three lengths as radios with the current one checked', () => {
    render(<LengthSelector value="medium" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /short/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /medium/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /long/i })).not.toBeChecked();
  });

  it('reports the newly selected length', async () => {
    const onChange = vi.fn();
    render(<LengthSelector value="medium" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: /long/i }));

    expect(onChange).toHaveBeenCalledWith('long');
  });

  it('does not fire while disabled', async () => {
    const onChange = vi.fn();
    render(<LengthSelector value="short" onChange={onChange} disabled />);

    await userEvent.click(screen.getByRole('radio', { name: /long/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
