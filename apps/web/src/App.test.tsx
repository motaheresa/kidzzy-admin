import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the API as up when /api/v1/health answers 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}'));
    render(<App />);
    expect(await screen.findByText('السيرفر شغال')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/health');
  });

  it('shows the API as down when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<App />);
    expect(await screen.findByText('السيرفر مش متاح')).toBeInTheDocument();
  });
});
