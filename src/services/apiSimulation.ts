/**
 * SIMULATED government-data integration — DEMO ONLY.
 *
 * Nothing in this file talks to a real system. `simulateGovernmentSync` waits on
 * `setTimeout` and then replays a scripted progress log. LACRRIS, Bhoomi Rashi,
 * ULPIN/Bhu-Naksha, NJDG/e-Courts CIS 3.0 and Bhuvan are PROPOSED integration
 * points for a future build — they are not connected here.
 *
 * SINGLE SOURCE OF TRUTH:
 * The `Parcel` object (seeded from src/data/mockData.ts) is the only source of
 * truth for a parcel's legal / revenue / GIS records. A simulated "sync" does NOT
 * return or replace those records — every progress line below is derived from the
 * parcel that was passed in, and the function only reports back a refreshed
 * timestamp. This prevents one parcel's sync from showing another parcel's data.
 *
 * Any UI surface that renders this narration must label it "Simulated
 * Integration — Demo".
 */
import { Parcel } from '../types';

export interface SyncLogStep {
  step: string;
  source: 'Tamil Nilam (Land Records)' | 'Bhoomi / Rashi' | 'ULPIN / Bhu-Naksha' | 'e-Courts CIS 3.0' | 'Bhuvan ISRO GIS';
  status: 'pending' | 'syncing' | 'success' | 'warning';
  message: string;
  timestamp: string;
}

export async function simulateGovernmentSync(
  parcel: Parcel,
  onProgress?: (step: SyncLogStep) => void
): Promise<{ syncedAt: string }> {
  const now = () => new Date().toLocaleTimeString();
  const emit = (s: Omit<SyncLogStep, 'timestamp'>) => onProgress?.({ ...s, timestamp: now() });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const rev = parcel.revenueRecord;
  const gis = parcel.gisRecord;
  const court = parcel.courtRecord;

  // Step 1 — Tamil Nilam / Land Records
  emit({
    step: '1/5',
    source: 'Tamil Nilam (Land Records)',
    status: 'syncing',
    message: `Querying Land Administration records for ${parcel.id} (Survey No. ${parcel.surveyNumber}, ${parcel.village})...`,
  });
  await wait(450);
  emit({
    step: '1/5',
    source: 'Tamil Nilam (Land Records)',
    status: 'success',
    message: `Patta/Chitta verified — ${parcel.coOwnerCount} registered co-owner(s); mutation status: ${parcel.mutationStatus}.`,
  });

  // Step 2 — Bhoomi / Revenue Portal
  emit({
    step: '2/5',
    source: 'Bhoomi / Rashi',
    status: 'syncing',
    message: 'Retrieving guideline value and Sub-Registrar encumbrance certificate...',
  });
  await wait(500);
  emit({
    step: '2/5',
    source: 'Bhoomi / Rashi',
    status: 'success',
    message: rev
      ? `Classification: ${rev.landClassification}. Guideline value ₹${rev.guidelineValuePerAcre.toLocaleString('en-IN')}/acre; EC: ${rev.encumbranceStatus} (${rev.subRegistrarOffice}).`
      : `Revenue extract retrieved for ${parcel.village}, ${parcel.taluk}.`,
  });

  // Step 3 — ULPIN / Bhu-Naksha Cadastral
  emit({
    step: '3/5',
    source: 'ULPIN / Bhu-Naksha',
    status: 'syncing',
    message: 'Fetching 14-digit ULPIN geometry & digital cadastral polygon vertices...',
  });
  await wait(400);
  emit({
    step: '3/5',
    source: 'ULPIN / Bhu-Naksha',
    status: 'success',
    message: `ULPIN ${parcel.ulpin} boundary validated against state GIS hub (${parcel.areaAcres} acres).`,
  });

  // Step 4 — e-Courts CIS 3.0
  emit({
    step: '4/5',
    source: 'e-Courts CIS 3.0',
    status: 'syncing',
    message: court
      ? `Scanning judicial records for CNR ${court.cnrNumber}...`
      : 'Scanning e-Courts CIS for any registered litigation on this survey number...',
  });
  await wait(600);
  emit(
    court
      ? {
          step: '4/5',
          source: 'e-Courts CIS 3.0',
          status: court.caseStatus === 'Active - Stay Order' ? 'warning' : 'success',
          message:
            `${court.caseStatus === 'Active - Stay Order' ? 'ALERT: ' : ''}` +
            `${court.caseType} ${court.caseNumber} at ${court.courtName} — status: ${court.caseStatus}` +
            `${court.interimInjunction ? ' (interim injunction in force)' : ''}.`,
        }
      : {
          step: '4/5',
          source: 'e-Courts CIS 3.0',
          status: 'success',
          message: 'No civil suit or writ petition found against this parcel.',
        }
  );

  // Step 5 — Bhuvan ISRO GIS Overlay
  emit({
    step: '5/5',
    source: 'Bhuvan ISRO GIS',
    status: 'syncing',
    message: 'Overlaying corridor right-of-way buffer on satellite raster...',
  });
  await wait(350);
  emit({
    step: '5/5',
    source: 'Bhuvan ISRO GIS',
    status: 'success',
    message: gis
      ? `Corridor intersection ${gis.intersectionAreaSqM.toLocaleString('en-IN')} m²; ${gis.distanceToCorridorCenterMeters} m to centerline; zone: ${gis.environmentalZone}.`
      : `Parcel footprint ${parcel.areaSqMeters.toLocaleString('en-IN')} m² overlaid on corridor raster.`,
  });

  return { syncedAt: new Date().toISOString().replace('T', ' ').substring(0, 16) };
}
