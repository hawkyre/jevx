import { isScore, type Score } from './model';

export type DraftKind = 'post' | 'reply' | 'quote';
export interface DraftAxis { id: string; label: string; criterion: string; weight: Score; enabled: boolean }
export interface DraftProfile { id: string; name: string; axes: DraftAxis[] }
export interface DraftSettings { consent: boolean; profiles: DraftProfile[]; selected: Record<DraftKind, string> }
export interface DraftState { settings: DraftSettings; connected: boolean }
export interface DraftInput { text: string; kind: DraftKind; parentText: string; contextMissing: boolean; hasMedia: boolean; profileId: string }
export interface DraftResult { scores: Record<string, Score | null> }
export const DRAFT_DEBOUNCE_MS = 1000;

const axis = (id: string, label: string, criterion: string): DraftAxis => ({ id, label, criterion, weight: 1, enabled: true });
const clarity = axis('clarity', 'Clarity', 'The reader can understand one clear point without filler or confusing wording. Concision must not remove useful context.');
const specificity = axis('specificity', 'Specificity', 'The draft uses concrete details, a useful example, or a precise question instead of vague generalities. Do not reward invented facts.');
const value = axis('value', 'Added value', 'The draft contributes an insight, useful experience, answer, or worthwhile question beyond repeating the parent post.');
const context = axis('context', 'Context fit', 'A reply or quote accurately addresses the supplied parent. A standalone post serves the intended audience. If parent context is missing for a reply or quote, choose unknown.');
const conversation = axis('conversation', 'Conversation', 'The draft gives someone a meaningful reason to respond. A good statement can be as strong as a question. Do not reward empty questions or engagement bait.');
const voice = axis('voice', 'Voice & tone', 'The draft sounds natural, respectful, and suited to the conversation and stated profile. Disagreement is not a defect. Do not infer a personal writing style absent from the profile.');
const hook = axis('hook', 'Opening', 'The opening makes a specific, honest reason to keep reading immediately clear. Avoid misleading curiosity gaps and exaggerated promises.');
const share = axis('share', 'Share value', 'The draft offers an insight, practical takeaway, or memorable observation worth passing on. Quotes should make sense with the quoted text; do not pretend unseen media is known.');
const emotion = axis('emotion', 'Resonance', 'The draft evokes relevant curiosity, recognition, surprise, or feeling without relying on outrage, harassment, or manipulation.');
const evidence = axis('evidence', 'Supported claims', 'Claims are appropriately qualified and supported by the supplied context. Do not verify external facts or assume credentials. First-person assertions are claims, not independent proof.');
const personal = axis('personal', 'Personal relevance', 'The draft responds to something specific about the other person or their post without fake familiarity or generic flattery. Missing recipient context means unknown.');

export const UNVALIDATED_DRAFT_PROFILES: DraftProfile[] = [
  { id: 'conversation', name: 'Conversation', axes: [clarity, specificity, value, context, conversation, voice] },
  { id: 'virality', name: 'Virality', axes: [clarity, hook, share, emotion, specificity] },
  { id: 'credibility', name: 'Credibility', axes: [clarity, specificity, value, evidence] },
  { id: 'connection', name: 'Connection', axes: [context, personal, conversation, voice] },
];

export function defaultDraftSettings(): DraftSettings {
  return { consent: false, profiles: UNVALIDATED_DRAFT_PROFILES.map(p => structuredClone(p)),
    selected: { post: 'conversation', reply: 'conversation', quote: 'conversation' } };
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
export const isDraftKind = (value: unknown): value is DraftKind => value === 'post' || value === 'reply' || value === 'quote';

export function parseDraftSettings(value: unknown): DraftSettings {
  if (value === undefined) return defaultDraftSettings();
  if (!record(value) || typeof value.consent !== 'boolean' || !Array.isArray(value.profiles) || !value.profiles.length || !record(value.selected)) throw new Error('Invalid draft settings');
  const profiles = value.profiles.map((p): DraftProfile => {
    if (!record(p) || !nonempty(p.id) || !nonempty(p.name) || !Array.isArray(p.axes) || !p.axes.length) throw new Error('Each profile needs a name and axes');
    const axes = p.axes.map((a): DraftAxis => {
      if (!record(a) || !nonempty(a.id) || !nonempty(a.label) || !nonempty(a.criterion) || !isScore(a.weight) || typeof a.enabled !== 'boolean') throw new Error('Each axis needs a name, criteria, and a weight from 1 to 5');
      return { id: a.id, label: a.label.trim(), criterion: a.criterion.trim(), weight: a.weight, enabled: a.enabled };
    });
    if (!axes.some(a => a.enabled) || new Set(axes.map(a => a.id)).size !== axes.length) throw new Error('Enable at least one axis and use unique axis IDs');
    return { id: p.id, name: p.name.trim(), axes };
  });
  if (new Set(profiles.map(p => p.id)).size !== profiles.length) throw new Error('Duplicate profile ID');
  const selected = value.selected;
  for (const kind of ['post', 'reply', 'quote']) if (!profiles.some(p => p.id === selected[kind])) throw new Error('Choose an existing profile for each draft type');
  return { consent: value.consent, profiles, selected: { post: String(selected.post), reply: String(selected.reply), quote: String(selected.quote) } };
}

export function isDraftInput(value: unknown): value is DraftInput {
  return record(value) && nonempty(value.text) && isDraftKind(value.kind) && typeof value.parentText === 'string' &&
    typeof value.contextMissing === 'boolean' && typeof value.hasMedia === 'boolean' && nonempty(value.profileId);
}

export function draftAverage(axes: DraftAxis[], scores: DraftResult['scores']): Score | null {
  const known = axes.filter(a => a.enabled && isScore(scores[a.id]));
  if (!known.length) return null;
  return Math.round(known.reduce((sum, a) => sum + scores[a.id]! * a.weight, 0) / known.reduce((sum, a) => sum + a.weight, 0)) as Score;
}
