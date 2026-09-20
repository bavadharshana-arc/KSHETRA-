import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { AppProvider } from '../context/AppContext';
import { KpiCard } from '../components/ui/KpiCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { SettingsView } from '../components/settings/SettingsView';
import { EmptyState } from '../components/feedback/EmptyState';
import { MapPin, AlertTriangle } from 'lucide-react';

// Helper to run axe-core on a rendered DOM node
async function checkA11y(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'best-practice']
    },
    rules: {
      // jsdom does not calculate layout geometry or rasterize fonts
      'color-contrast': { enabled: false }
    }
  });

  return results.violations;
}

// WCAG 2.1 Relative Luminance and Contrast Ratio calculation
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function getLuminance(r: number, g: number, b: number): number {
  const [aR, aG, aB] = [r, g, b].map(val => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * aR + 0.7152 * aG + 0.0722 * aB;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Accessibility & WCAG 2.1 AA Compliance Audit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('KPI Card (Standard & Hero) has zero accessibility violations', async () => {
    const { container } = render(
      <div>
        <KpiCard
          variant="hero"
          color="amber"
          label="High-Risk Parcels (Corridor)"
          value="28"
          sublabel="7.4% of corridor"
        />
        <KpiCard
          variant="standard"
          color="blue"
          label="Total Acquisition Scope"
          value="380"
          sublabel="28.5 km RoW"
        />
      </div>
    );

    const violations = await checkA11y(container);
    expect(violations).toHaveLength(0);
  });

  it('Button component variants provide accessible roles, focus states, and aria labels', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Submit Action</Button>
        <Button variant="secondary" disabled>Disabled Button</Button>
        <Button variant="outline" leftIcon={<MapPin />}>Select Parcel</Button>
        <Button variant="danger" isLoading>Deleting...</Button>
      </div>
    );

    const violations = await checkA11y(container);
    expect(violations).toHaveLength(0);
  });

  it('Modal dialog conforms to WAI-ARIA dialog specifications', async () => {
    const { baseElement } = render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Statutory Injunction Review"
        description="Review High Court stay orders on survey parcel P-0245"
      >
        <div>
          <label htmlFor="test-input" className="block text-xs">Officer Observation</label>
          <input id="test-input" type="text" defaultValue="Counter-affidavit filed." />
        </div>
      </Modal>
    );

    const modalDialog = baseElement.querySelector('[role="dialog"]');
    expect(modalDialog).toBeTruthy();
    expect(modalDialog?.getAttribute('aria-modal')).toBe('true');
    expect(modalDialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('EmptyState feedback component has accessible headings and action buttons', async () => {
    const { container } = render(
      <EmptyState
        icon={AlertTriangle}
        title="No alerts logged"
        description="There are currently no active statutory bottlenecks."
        action={{
          label: "Refresh Log",
          onClick: () => {}
        }}
      />
    );

    const violations = await checkA11y(container);
    expect(violations).toHaveLength(0);
  });

  it('SettingsView range sliders possess aria-label, aria-valuemin, aria-valuemax, aria-valuenow', async () => {
    const { container } = render(
      <AppProvider>
        <SettingsView />
      </AppProvider>
    );

    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(2);

    sliders.forEach(slider => {
      expect(slider.getAttribute('aria-label')).toBeTruthy();
      expect(slider.getAttribute('aria-valuemin')).toBeTruthy();
      expect(slider.getAttribute('aria-valuemax')).toBeTruthy();
      expect(slider.getAttribute('aria-valuenow')).toBeTruthy();
    });

    const violations = await checkA11y(container);
    expect(violations).toHaveLength(0);
  });

  it('Verified contrast ratios on core institutional tokens exceed WCAG 2.1 AA requirement (>= 4.5:1)', () => {
    // Core brand navy structure against white/light backgrounds
    const navyOnWhite = getContrastRatio('#0F172A', '#FFFFFF'); // slate-900 on white
    expect(navyOnWhite).toBeGreaterThanOrEqual(4.5); // Expected ~16.8:1

    const brandBlueOnWhite = getContrastRatio('#1D4ED8', '#FFFFFF'); // blue-700 on white
    expect(brandBlueOnWhite).toBeGreaterThanOrEqual(4.5); // Expected ~5.9:1

    // Critical emergency red on light red surface
    const criticalRedOnSurface = getContrastRatio('#991B1B', '#FEF2F2'); // red-800 on red-50
    expect(criticalRedOnSurface).toBeGreaterThanOrEqual(4.5); // Expected ~7.4:1

    // Attention amber text on amber surface
    const amberTextOnSurface = getContrastRatio('#78350F', '#FFFBEB'); // amber-900 on amber-50
    expect(amberTextOnSurface).toBeGreaterThanOrEqual(4.5); // Expected ~8.2:1

    // AI accent indigo on white
    const aiIndigoOnWhite = getContrastRatio('#4338CA', '#FFFFFF'); // indigo-700 on white
    expect(aiIndigoOnWhite).toBeGreaterThanOrEqual(4.5); // Expected ~7.8:1
  });
});
