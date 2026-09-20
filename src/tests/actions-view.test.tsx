import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AppProvider } from '../context/AppContext';
import axe from 'axe-core';
import { ActionsView } from '../components/actions/ActionsView';

const renderView = () =>
  render(
    <AppProvider>
      <ActionsView />
    </AppProvider>
  );

describe('ActionsView search / filter / sort', () => {
  beforeEach(() => localStorage.clear());

  it('shows all seeded actions with a count', async () => {
    renderView();
    expect(await screen.findByText(/Showing/)).toBeTruthy();
    expect(screen.getAllByText(/Special Field Verification/).length).toBeGreaterThan(0);
  });

  it('filters by search text and shows an empty state with a working clear', async () => {
    renderView();
    const search = await screen.findByLabelText('Search actions');
    fireEvent.change(search, { target: { value: 'zzz-no-such-action' } });
    expect(await screen.findByText('No actions match these filters')).toBeTruthy();

    const clearButtons = screen.getAllByRole('button', { name: /Clear filters/i });
    fireEvent.click(clearButtons[0]);
    await waitFor(() => expect(screen.queryByText('No actions match these filters')).toBeNull());
  });

  it('filters by status', async () => {
    renderView();
    const status = await screen.findByLabelText('Filter by status');
    fireEvent.change(status, { target: { value: 'Completed' } });
    await waitFor(() => {
      expect(screen.queryAllByText(/Special Field Verification/).length).toBe(0);
    });
    expect(screen.getAllByText(/Boundary Geo-tagging/).length).toBeGreaterThan(0);
  });

  it('opens the action detail modal', async () => {
    renderView();
    const link = (await screen.findAllByRole('button', { name: /Boundary Geo-tagging/ }))[0];
    fireEvent.click(link);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Responsible owner/)).toBeTruthy();
  });

  it('has no axe violations (list view and kanban)', async () => {
    const { container } = renderView();
    await screen.findByLabelText('Search actions');
    const run = async () =>
      (await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
        rules: { 'color-contrast': { enabled: false } }
      })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
    expect(await run()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(await run()).toEqual([]);
  });
});
