export {
  buildIntroCompletionPatch,
  isFirstUseGuidanceActive,
  resolveFirstUseStep,
  shouldEvaluateFirstUseOnBoot,
  type BootFirstUseEvaluationInput,
  type FirstUseGateOptions,
  type FirstUseStep,
  type GuidedTutorialRenderer,
  type GuidedTutorialStepProps,
} from './firstUseGate.ts'
export {
  buildDefaultBrowserIngressPolicy,
  createR06ExternalIngressBridge,
  createVerifiedChallengeIngressProvider,
  extractRawLocationTarget,
  type R06ExternalIngressBridge,
  type R06ExternalIngressOptions,
  type VerifiedChallengeIngressProvider,
} from './externalIngressBridge.ts'
