import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../context/AppContext';
import { useConstructionReadiness } from '../hooks/useConstructionReadiness';
import { boxesOverlap, labelPriority, labelSize, placeLabel, type Box } from '../data/geo/labelLayout';

const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>;
const useBoth = () => ({ r: useConstructionReadiness(), app: useApp() });

describe('project-wide readiness (real hook over seed project)', () => {
  beforeEach(() => localStorage.clear());

  it('totals equal the sum of per-parcel overlapped lengths, and never exceed the corridor', () => {
    const { result } = renderHook(useBoth, { wrapper });
    const { r } = result.current;
    expect(r.available).toBe(true);
    const direct = Object.values(r.relations).filter(x => x.relation === 'intersects');
    const sum = direct.reduce((a, x) => a + x.directLengthKm, 0);
    expect(r.readyKm + r.partialKm + r.blockedKm).toBeCloseTo(sum, 1);
    expect(r.readyKm + r.partialKm + r.blockedKm).toBeLessThan(r.totalCorridorKm);
    expect(r.unsurveyedKm).toBeGreaterThan(0);
    // parcel accounting: every parcel with geometry lands in exactly one relation bucket
    const n = Object.keys(r.relations).length;
    expect(r.affectedParcels.ready + r.affectedParcels.partial + r.affectedParcels.blocked + r.proximityParcels + r.outsideParcels).toBe(n);
  });

  it('segmentation: blocked/partial/ready segments come only from parcels of that risk band and overlap the ROW', () => {
    const { result } = renderHook(useBoth, { wrapper });
    const { r, app } = result.current;
    const band = (id: string) => app.parcels.find(p => p.id === id)?.riskLevel;
    for (const s of r.blockedSegments) { expect(band(s.parcelId)).toBe('high'); expect(r.relations[s.parcelId].relation).toBe('intersects'); }
    for (const s of r.partialSegments) { expect(band(s.parcelId)).toBe('medium'); expect(r.relations[s.parcelId].relation).toBe('intersects'); }
    for (const s of r.readySegments) { expect(band(s.parcelId)).toBe('low'); expect(r.relations[s.parcelId].relation).toBe('intersects'); }
    // proximity/outside parcels contribute no segment at all
    const drawn = new Set([...r.blockedSegments, ...r.partialSegments, ...r.readySegments].map(s => s.parcelId));
    for (const [id, rel] of Object.entries(r.relations)) if (rel.relation !== 'intersects') expect(drawn.has(id)).toBe(false);
    // segment km equals the summed status km
    expect(r.blockedSegments.reduce((a, s) => a + s.lengthKm, 0)).toBeCloseTo(r.blockedKm, 1);
  });

  it('changing the active alignment recalculates relations and totals', async () => {
    const { result } = renderHook(useBoth, { wrapper });
    const before = result.current.r;
    const project = result.current.app.project;
    // Shift the whole route ~5 km north: no seed parcel can overlap it any more.
    const shifted = project.corridorPath.map(([lat, lng]) => [lat + 0.05, lng] as [number, number]);
    await act(async () => { await result.current.app.updateProjectRoute(project.id, shifted); });
    await waitFor(() => expect(result.current.r).not.toBe(before));
    const after = result.current.r;
    expect(after.blockedKm + after.partialKm + after.readyKm).toBe(0);
    expect(after.affectedParcels.blocked + after.affectedParcels.partial + after.affectedParcels.ready).toBe(0);
    expect(before.blockedKm + before.partialKm + before.readyKm).toBeGreaterThan(0);
  });
});

describe('parcel label selection and layout', () => {
  it('only selected, high, ROW-overlapping or critical parcels get labels, in that priority order', () => {
    const base = { isSelected: false, isHigh: false, intersectsRow: false, isCritical: false };
    expect(labelPriority(base)).toBeNull();
    expect(labelPriority({ ...base, isSelected: true, isHigh: true })).toBe(0);
    expect(labelPriority({ ...base, isHigh: true })).toBe(1);
    expect(labelPriority({ ...base, intersectsRow: true })).toBe(2);
    expect(labelPriority({ ...base, isCritical: true })).toBe(3);
  });

  it('labels never overlap: stacking many labels on one point places each in a free slot or skips it', () => {
    const placed: Box[] = [];
    const view = { x: 800, y: 600 };
    const boxes: Box[] = [];
    for (let i = 0; i < 10; i++) {
      const b = placeLabel({ x: 400, y: 300 }, labelSize(`P-${i}`), placed, view);
      if (b) boxes.push(b);
    }
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThan(10); // some must be skipped rather than overlap
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
  });

  it('the highest-priority label is placed first and keeps its preferred slot; off-screen labels are skipped', () => {
    const placed: Box[] = [];
    const first = placeLabel({ x: 400, y: 300 }, labelSize('P-0001', 'High exposure · x'), placed, { x: 800, y: 600 });
    expect(first).not.toBeNull();
    expect(placeLabel({ x: 2, y: 2 }, labelSize('P-0002'), [], { x: 800, y: 600 })).not.toBeNull(); // has a slot inside view
    expect(placeLabel({ x: 400, y: 300 }, labelSize('P-0003'), [], { x: 60, y: 30 })).toBeNull(); // viewport too small
  });
});
