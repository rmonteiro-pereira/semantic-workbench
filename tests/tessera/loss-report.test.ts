// Checks the loss report has the contract's shape, sorts its lists, hides lost values and changes its digest whenever an input, an option or the compiler version changes.
import { expect, test } from 'bun:test';
import { LossPolicyError, acceptLoss, buildLossReport, digestOf, parseLossPolicy, printReport, type LossEntry, type ReportSubject } from '../../src/shared/tessera/loss-report';
import { REGISTRY } from '../../src/shared/tessera/registry';

const loss = (document: string, pointer: string, text: string): LossEntry => ({
  document,
  item: 'sw1:#ontology:Retail',
  property: 'tessera_notes',
  pointer,
  bytes: text.length + 2,
  sha256: 'a'.repeat(64),
});

const subject: ReportSubject = {
  compiler: { name: 'tessera', version: '1.0.0' },
  base: { version: '0.2.0.dev0', label: 'valid against the bundled Ossie 0.2.0.dev0 draft' },
  lossPolicySha256: null,
  inputs: [
    { path: 'retail/ontology.yaml', sha256: 'b'.repeat(64), treatment: 'compiled' },
    { path: 'retail/a.yaml', sha256: 'c'.repeat(64), treatment: 'copied' },
  ],
  outputs: [
    { path: 'retail/ontology.yaml', sha256: 'd'.repeat(64) },
    { path: 'retail/a.yaml', sha256: 'c'.repeat(64) },
  ],
  losses: [loss('retail/ontology.yaml', '/ontology/1/tessera_notes', 'SECRET-TEXT'), loss('retail/ontology.yaml', '/ontology/0/tessera_notes', 'other')],
};

test('the report has the shape of the contract', () => {
  const report = buildLossReport(subject);
  expect(Object.keys(report).sort()).toEqual(['base', 'compiler', 'counts', 'digest', 'inputs', 'losses', 'options', 'outputs', 'reportVersion']);
  expect(report.reportVersion).toBe(1);
  expect(report.options).toEqual({ lossPolicy: null });
  expect(report.counts).toEqual({ tessera_notes: 2 });
  expect(report.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
});

test('lists are sorted by path, and losses by document then pointer', () => {
  const report = buildLossReport(subject);
  expect(report.inputs.map(input => input.path)).toEqual(['retail/a.yaml', 'retail/ontology.yaml']);
  expect(report.outputs.map(output => output.path)).toEqual(['retail/a.yaml', 'retail/ontology.yaml']);
  expect(report.losses.map(entry => entry.pointer)).toEqual(['/ontology/0/tessera_notes', '/ontology/1/tessera_notes']);
});

test('input order does not change the digest', () => {
  const shuffled = { ...subject, inputs: [...subject.inputs].reverse(), losses: [...subject.losses].reverse() };
  expect(buildLossReport(shuffled).digest).toBe(buildLossReport(subject).digest);
});

test('the printed report uses sorted keys, two spaces, LF and one final newline', () => {
  const text = printReport(buildLossReport(subject));
  expect(text.startsWith('{\n  "base": {')).toBe(true);
  expect(text.endsWith('}\n')).toBe(true);
  expect(text).not.toContain('\r');
});

test('the digest is the hash of the report without its digest field', () => {
  const { digest, ...body } = buildLossReport(subject);
  expect(digest).toBe(digestOf(body));
});

test('a changed input byte, option or compiler version changes the digest', () => {
  const base = buildLossReport(subject).digest;
  const changedInput = { ...subject, inputs: [{ ...subject.inputs[0], sha256: 'e'.repeat(64) }, subject.inputs[1]] };
  const changedOutput = { ...subject, outputs: [{ ...subject.outputs[0], sha256: 'e'.repeat(64) }, subject.outputs[1]] };
  const changedOption = { ...subject, lossPolicySha256: 'f'.repeat(64) };
  const changedVersion = { ...subject, compiler: { name: 'tessera', version: '1.0.1' } };
  const changedLoss = { ...subject, losses: [loss('retail/ontology.yaml', '/ontology/1/tessera_notes', 'edited!!!!'), subject.losses[1]] };
  for (const changed of [changedInput, changedOutput, changedOption, changedVersion, changedLoss]) expect(buildLossReport(changed).digest).not.toBe(base);
});

test('no lost value appears in the printed report', () => {
  expect(printReport(buildLossReport(subject))).not.toContain('SECRET-TEXT');
});

// Accepting a loss.
const registry = REGISTRY;
const lossReport = buildLossReport(subject);
const policy = (...allow: string[]) => parseLossPolicy(JSON.stringify({ policy: 1, allow }), registry);

test('a report with no loss needs no acceptance', () => {
  expect(acceptLoss(buildLossReport({ ...subject, losses: [] }), {})).toEqual({ accepted: 'none' });
});

test('a report with a loss is refused when nothing is offered', () => {
  expect(acceptLoss(lossReport, {})).toMatchObject({ refusal: expect.stringContaining('not accepted') });
});

test('the exact digest accepts the loss', () => {
  expect(acceptLoss(lossReport, { digest: lossReport.digest })).toEqual({ accepted: 'digest' });
});

test('a digest from before a note was edited is refused with both digests named', () => {
  const edited = buildLossReport({ ...subject, losses: [loss('retail/ontology.yaml', '/ontology/1/tessera_notes', 'edited!!!!'), subject.losses[1]] });
  const result = acceptLoss(edited, { digest: lossReport.digest });
  expect(result).toMatchObject({ refusal: expect.stringContaining(edited.digest) });
});

test('a digest from before an option changed is refused', () => {
  const changedOption = buildLossReport({ ...subject, lossPolicySha256: 'f'.repeat(64) });
  expect('refusal' in acceptLoss(changedOption, { digest: lossReport.digest })).toBe(true);
});

test('a policy that allows the lost property accepts the loss, and one that does not refuses it', () => {
  expect(acceptLoss(lossReport, { policy: policy('tessera_notes') })).toEqual({ accepted: 'policy' });
  expect(acceptLoss(lossReport, { policy: policy() })).toMatchObject({ refusal: expect.stringContaining('does not allow tessera_notes') });
});

test('when both are given, either one is enough', () => {
  expect(acceptLoss(lossReport, { digest: 'sha256:wrong', policy: policy('tessera_notes') })).toEqual({ accepted: 'policy' });
  expect(acceptLoss(lossReport, { digest: lossReport.digest, policy: policy() })).toEqual({ accepted: 'digest' });
  expect('refusal' in acceptLoss(lossReport, { digest: 'sha256:wrong', policy: policy() })).toBe(true);
});

test('a malformed policy is refused', () => {
  for (const text of ['not json', '[]', '{"policy":2,"allow":[]}', '{"policy":1}', '{"policy":1,"allow":[1]}', '{"policy":1,"allow":[],"extra":true}', '{"policy":1,"allow":["tessera_other"]}']) {
    expect(() => parseLossPolicy(text, registry), text).toThrow(LossPolicyError);
  }
});

test('a registered reserved name cannot be allowed because it is not registered', () => {
  expect(() => parseLossPolicy('{"policy":1,"allow":["tessera_governance"]}', registry)).toThrow('not a registered property');
});
