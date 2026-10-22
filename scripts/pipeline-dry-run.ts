import { readFileSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { parseArgs } from 'node:util';
import { gateSteps, parseGateOptions } from './ci-validate';
import { lintPipeline, readPipelineInput, readSampleVariables } from './pipeline-lint';
import type { PipelineNode } from './pipeline-lint';

/** A single expanded pipeline step, including its simulated success-path condition. */
export type PlanStep = {
  stage: string;
  job: string;
  kind: 'local' | 'azure' | 'setup' | 'artifact';
  command: string;
  condition: string;
  enabled: boolean;
  serviceConnection?: string;
};
/** Supported input refs for an offline preview. */
export type RunKind = { branch: string; name: string };

/** Maps supported run kinds to the Azure branch variables. */
export function parseRunKind(run: string): RunKind {
  if (run === 'pr') return { branch: 'refs/pull/1/merge', name: 'merge' };
  if (run === 'main') return { branch: 'refs/heads/main', name: 'main' };
  if (/^tag:v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(run)) {
    return { branch: `refs/tags/${run.slice(4)}`, name: run.slice(4) };
  }
  throw Error(`Unknown run kind: ${run}`);
}

function conditionArguments(source: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "'") quoted = !quoted;
    if (quoted) continue;
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (character === ',' && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (source.trim()) args.push(source.slice(start).trim());
  return args;
}

/** Evaluates the supported Azure condition language and rejects unknown expressions. */
export function evaluateCondition(
  source: string,
  variables: Record<string, string>,
): boolean | string {
  const expression = source.trim();
  if (/^'[^']*'$/.test(expression)) return expression.slice(1, -1);
  const variable = /^variables\['([^']+)'\]$/.exec(expression);
  if (variable) {
    if (!(variable[1] in variables)) throw Error(`Unknown condition variable: ${variable[1]}`);
    return variables[variable[1]];
  }
  if (/^dependencies\.[\w]+\.result$/.test(expression)) {
    if (!Object.hasOwn(variables, expression)) throw Error(`Unknown dependency: ${expression}`);
    return variables[expression];
  }
  const call = /^(\w+)\(([\s\S]*)\)$/.exec(expression);
  if (!call) throw Error(`Unsupported pipeline condition: ${source}`);
  const args = conditionArguments(call[2]).map(arg => evaluateCondition(arg, variables));
  switch (call[1]) {
    case 'succeeded':
    case 'always':
      return true;
    case 'failed':
      return false;
    case 'and':
      return args.every(value => value === true);
    case 'or':
      return args.some(value => value === true);
    case 'eq':
      return args[0] === args[1];
    case 'ne':
      return args[0] !== args[1];
    case 'in':
      return args.slice(1).includes(args[0]);
    case 'startsWith':
      return String(args[0]).startsWith(String(args[1]));
    default:
      throw Error(`Unsupported pipeline condition: ${source}`);
  }
}

function expand(
  source: string,
  parameters: PipelineNode,
  variables: Record<string, string>,
): string {
  return source
    .replace(/\$\{\{\s*parameters\.(\w+)\s*\}\}/g, (_match, name) => {
      if (!(name in parameters)) throw Error(`Unknown parameter: ${name}`);
      return String(parameters[name]);
    })
    .replace(/\$\(([\w.]+)\)/g, (_match, name) => {
      if (!(name in variables)) throw Error(`Unknown variable: ${name}`);
      return variables[name];
    });
}

function templatePath(parent: string, template: string): string {
  if (template.startsWith('/')) return posix.normalize(template.slice(1));
  return posix.normalize(posix.join(dirname(parent), template));
}

/** The pipeline files and the values that macros and template parameters resolve against. */
type Expansion = {
  documents: Record<string, PipelineNode>;
  parameters: PipelineNode;
  variables: Record<string, string>;
};

/** Where steps come from; setup steps keep their agent shell variables unexpanded. */
type StepSource = { file: string; setup?: boolean };

function expandSteps(
  steps: PipelineNode[],
  source: StepSource,
  expansion: Expansion,
  context: Omit<PlanStep, 'command' | 'kind'>,
): PlanStep[] {
  const { documents, parameters, variables } = expansion;
  const setup = source.setup ?? false;
  return steps.flatMap(step => {
    if (step.template) {
      const path = templatePath(source.file, step.template);
      if (!documents[path]) throw Error(`Missing template: ${path}`);
      const nested = { file: path, setup: path.endsWith('/setup-steps.yml') };
      return expandSteps(documents[path].steps, nested, expansion, context);
    }
    const condition = `and(${context.condition}, ${step.condition ?? 'succeeded()'})`;
    const enabled = evaluateCondition(condition, variables) === true && context.enabled;
    const command =
      step.bash ??
      step.script ??
      step.inputs?.inlineScript ??
      step.task ??
      `checkout: ${step.checkout}`;
    let kind: PlanStep['kind'] = 'local';
    if (setup || step.checkout) kind = 'setup';
    else if (step.task === 'AzureCLI@2') kind = 'azure';
    else if (step.task) kind = 'artifact';
    // Setup shell variables belong to the agent, not the pipeline macro expander.
    return [
      {
        ...context,
        kind,
        condition,
        enabled,
        command: setup ? command : expand(command, parameters, variables),
        ...(step.inputs?.azureSubscription
          ? {
              serviceConnection: expand(step.inputs.azureSubscription, parameters, variables),
            }
          : {}),
      },
    ];
  });
}

function expandJobs(
  jobs: PipelineNode[],
  file: string,
  expansion: Expansion,
): { job: PipelineNode; file: string; parameters: PipelineNode }[] {
  const { documents, parameters, variables } = expansion;
  return jobs.flatMap(job => {
    if (!job.template) return [{ job, file, parameters }];
    const path = templatePath(file, job.template);
    if (!documents[path]) throw Error(`Missing template: ${path}`);
    const supplied = Object.fromEntries(
      Object.entries(job.parameters ?? {}).map(([key, value]) => [
        key,
        expand(String(value), parameters, variables),
      ]),
    );
    return expandJobs(documents[path].jobs, path, {
      ...expansion,
      parameters: { ...parameters, ...supplied },
    });
  });
}

function checkDependencies(nodes: PipelineNode[], kind: 'stage' | 'job') {
  const earlier = new Set<string>();
  for (const node of nodes) {
    const name = node[kind];
    if (typeof name !== 'string' || earlier.has(name)) {
      throw Error(`Missing or duplicate ${kind}: ${name}`);
    }
    const dependencies = node.dependsOn ?? [];
    for (const dependency of Array.isArray(dependencies) ? dependencies : [dependencies]) {
      if (!earlier.has(dependency)) {
        throw Error(`${kind} ${name} depends on unknown or non-earlier ${kind}: ${dependency}`);
      }
    }
    earlier.add(name);
  }
}

function planJobs(stage: PipelineNode, expansion: Expansion, stageEnabled: boolean): PlanStep[] {
  const { variables } = expansion;
  const expanded = expandJobs(stage.jobs, 'azure-pipelines.yml', expansion);
  checkDependencies(
    expanded.map(entry => entry.job),
    'job',
  );
  return expanded.flatMap(({ job, file, parameters }) => {
    const condition = job.condition ?? 'succeeded()';
    const enabled = evaluateCondition(condition, variables) === true && stageEnabled;
    variables[`dependencies.${job.job}.result`] = enabled ? 'Succeeded' : 'Skipped';
    const matrix = job.strategy?.matrix ?? { default: {} };
    return Object.entries(matrix).flatMap(([leg, values]) =>
      expandSteps(
        job.steps,
        { file },
        {
          documents: expansion.documents,
          parameters,
          variables: { ...variables, ...(values as Record<string, string>) },
        },
        {
          stage: stage.stage,
          job: leg === 'default' ? job.job : `${job.job}/${leg}`,
          condition,
          enabled,
        },
      ),
    );
  });
}

/** Ensures pipeline local work maps exactly to the local quality gate. */
export function validatePlan(plan: PlanStep[]): void {
  const selected = new Set<string>();
  for (const step of plan.filter(step => step.kind === 'local')) {
    const match = /^bun run ci:validate\s+(.*)$/.exec(step.command);
    if (!match) throw Error(`Pipeline step is not in ci:validate: ${step.command}`);
    const options = parseGateOptions(match[1].split(/\s+/));
    options.steps.forEach(name => selected.add(name));
  }
  for (const step of gateSteps) {
    if (!selected.has(step)) throw Error(`Pipeline is missing ci:validate step: ${step}`);
  }
}

/** Expands actual templates, matrix legs and sample values into a success-path plan. */
export function buildPlan(
  documents: Record<string, PipelineNode>,
  sample: PipelineNode,
  run: string,
) {
  const kind = parseRunKind(run);
  const pipeline = documents['azure-pipelines.yml'];
  const defaults = Object.fromEntries(
    pipeline.parameters.map((parameter: PipelineNode) => [parameter.name, parameter.default]),
  );
  const parameters = { ...defaults, ...sample.parameters };
  const variables = {
    ...sample.variables,
    'Build.SourceBranch': kind.branch,
    'Build.SourceBranchName': kind.name,
    'System.JobId': 'dry-run',
  };
  checkDependencies(pipeline.stages, 'stage');
  const stageResults: Record<string, string> = {};
  const plan = pipeline.stages.flatMap((stage: PipelineNode) => {
    const enabled =
      evaluateCondition(stage.condition ?? 'succeeded()', { ...variables, ...stageResults }) ===
      true;
    stageResults[`dependencies.${stage.stage}.result`] = enabled ? 'Succeeded' : 'Skipped';
    return planJobs(stage, { documents, parameters, variables: { ...variables } }, enabled);
  });
  validatePlan(plan);
  return plan as PlanStep[];
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    options: { run: { type: 'string', default: 'pr' }, execute: { type: 'boolean' } },
  });
  const documents = lintPipeline(
    readPipelineInput(),
    JSON.parse(readFileSync('deploy/azure-devops/schema/service-schema.json', 'utf8')),
  );
  const plan = buildPlan(documents, readSampleVariables(), values.run!);
  for (const step of plan) {
    console.log(
      `${step.enabled ? 'RUN' : 'SKIP'} ${step.stage}/${step.job} [${step.kind}] ` +
        `${step.command} (condition: ${step.condition}; ` +
        `connection: ${step.serviceConnection ?? 'none'})`,
    );
    if (!values.execute || !step.enabled || step.kind !== 'local') continue;
    const child = Bun.spawn(step.command.split(/\s+/), { stdout: 'inherit', stderr: 'inherit' });
    if ((await child.exited) !== 0) throw Error(`Dry-run local step failed: ${step.command}`);
  }
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
