import type { AnalysisTrack } from '@/audio/analysis';
import type { TrackSummary } from '@/wizard/plan';
import type { WizardConfig, WizardContext, WizardStepId } from '@/wizard/types';

/** Props shared by every wizard step. */
export interface WizardStepProps {
  config: WizardConfig;
  context: WizardContext;
  summary: TrackSummary;
  track: AnalysisTrack | null;
  update(recipe: (config: WizardConfig) => WizardConfig): void;
  jumpTo(step: WizardStepId): void;
}
