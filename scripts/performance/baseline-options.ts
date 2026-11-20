export function parseBaselineOptions(argv: string[], env: NodeJS.ProcessEnv = process.env) {
  const options = {
    scenario: 'prototype' as 'prototype' | 'connected',
    runs: Number(env.PERF_RUNS ?? 3),
    jsonOut: env.PERF_JSON_OUT || undefined,
    mdOut: env.PERF_MD_OUT || undefined,
    quiet: false,
  };
  if (!Number.isSafeInteger(options.runs) || options.runs < 1) {
    throw new Error(`PERF_RUNS must be a positive integer; received "${env.PERF_RUNS}"`);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (!['--scenario', '--json-out', '--md-out'].includes(option)) {
      throw new Error(`Unknown performance option: ${option}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    if (option === '--scenario') {
      if (value !== 'prototype' && value !== 'connected') {
        throw new Error(`Unknown performance scenario: ${value}`);
      }
      options.scenario = value;
    } else if (option === '--json-out') {
      options.jsonOut = value;
    } else {
      options.mdOut = value;
    }
  }
  return options;
}
