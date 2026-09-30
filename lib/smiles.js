/**
 * SMILES normalization for SwissTargetPrediction.
 *
 * The service answers one prediction job per submission and refuses anything it
 * reads as more than one molecule, so a salt — the form most active
 * pharmaceutical ingredients are weighed in, e.g. a hydrochloride or a sodium
 * salt — is answered with a jobless page and looks like a rate limit. Verified
 * against the live service: `[Cl-].CC(=O)Oc1ccccc1C(=O)O` never yields a job
 * while `CC(=O)Oc1ccccc1C(=O)O` does, submitted seconds apart.
 *
 * This module turns one submitted line into the single neutral parent the
 * service expects, and reports exactly what it changed:
 *
 * 1. clean the line (whitespace, stray quotes, empty components);
 * 2. split on `.` and drop counter-ions — `[Na+]`, `[Cl-]`, `[K+]`, `[Ca+2]`,
 *    `[NH4+]`, a bare `Cl`, an oxide `[O-]`, …;
 * 3. keep the largest remaining fragment when the input is a real mixture;
 * 4. neutralise the charges that are safe to neutralise, because the predictor
 *    is trained on neutral drug-like molecules.
 *
 * Refusing to guess is part of the contract: a quaternary ammonium stays charged
 * (it has no hydrogen to lose), and a fragment carrying a nitro or another
 * onium group is left untouched rather than rewritten into a wrong molecule.
 * @module @yumeayai/dsh-swiss-target/lib/smiles
 */

/** Fragments that are counter-ions rather than the molecule of interest. */
const LONE_HALOGEN_OR_METAL = /^(?:Cl|Br|I|F|Li|Na|K|Rb|Cs|Mg|Ca|Sr|Ba|Zn|Fe|Cu|Mn|Co|Ni|Al)$/

/** A bracket atom carrying a formal charge, e.g. `[Na+]`, `[Cl-]`, `[Ca+2]`, `[NH4+]`. */
const BRACKET_CHARGE = /\[[^\]]*[+-]\d?\]/

/** Charges this module knows how to neutralise, and their neutral spelling. */
const NEUTRALIZATIONS = Object.freeze([
  { pattern: /\[O-\]/g, replacement: 'O', label: '[O-] → O (acid, alcohol or phenol)' },
  { pattern: /\[NH3\+\]/g, replacement: 'N', label: '[NH3+] → N (ammonium)' },
  { pattern: /\[NH2\+\]/g, replacement: 'N', label: '[NH2+] → N (iminium)' },
  { pattern: /\[NH\+\]/g, replacement: 'N', label: '[NH+] → N (protonated amine)' },
  { pattern: /\[nH\+\]/g, replacement: 'n', label: '[nH+] → n (protonated aromatic nitrogen)' },
])

/**
 * Onium groups whose charge must not be moved: pulling the `[O-]` off a nitro
 * group would invent a nitronic acid.
 */
const ONIUM_GUARD = /\[(?:N|n|S|s|O|o|P|p)\+/

/**
 * Clean one submitted line: drop whitespace, wrapping quotes and stray dots.
 * @param input - the raw line as typed or pasted.
 * @returns the cleaned SMILES string.
 */
export function cleanSmiles(input) {
  return String(input ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\s\u00a0]+/g, '')
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/[;,:]+$/g, '')
}

/**
 * Split a SMILES string on its component dots, ignoring dots inside brackets.
 * @param smiles - a cleaned SMILES string.
 * @returns the non-empty components in order.
 */
export function splitComponents(smiles) {
  const components = []
  let current = ''
  let depth = 0
  for (const char of smiles) {
    if (char === '[') depth += 1
    else if (char === ']') depth = Math.max(0, depth - 1)
    if (char === '.' && depth === 0) {
      components.push(current)
      current = ''
      continue
    }
    current += char
  }
  components.push(current)
  return components.map(component => component.trim()).filter(component => component !== '')
}

/**
 * Count the heavy atoms of one fragment, which is enough to tell a counter-ion
 * from the molecule of interest.
 * @param fragment - one SMILES component.
 * @returns the number of non-hydrogen atoms.
 */
export function heavyAtomCount(fragment) {
  const tokens = fragment.match(/\[[^\]]+\]|Br|Cl|Si|Se|[BCNOPSFIHK]|[bcnops]/g) ?? []
  return tokens.filter(token => !/^\[H[+-]?\d?\]$/.test(token)).length
}

/**
 * Whether one fragment is a counter-ion rather than the molecule asked about.
 * Only ever applied when the submission has more than one component.
 * @param fragment - one SMILES component.
 * @returns whether it should be dropped.
 */
export function isCounterIon(fragment) {
  if (heavyAtomCount(fragment) > 2) return false
  if (BRACKET_CHARGE.test(fragment)) return true
  if (/^\[H[+-]\]$/.test(fragment)) return true
  return LONE_HALOGEN_OR_METAL.test(fragment)
}

/**
 * Neutralise the charges that can be neutralised without guessing a structure:
 * protonated acids, amines and aromatic nitrogens. Anything else — quaternary
 * ammonium, a fragment with a nitro or another onium group — is left as the
 * caller wrote it, so the reported molecule is never an invention.
 * @param fragment - the retained SMILES component.
 * @returns the possibly neutralised fragment and the changes applied.
 */
export function neutralizeFragment(fragment) {
  const guarded = ONIUM_GUARD.test(fragment)
  let value = fragment
  const changes = []
  for (const rule of NEUTRALIZATIONS) {
    if (rule.replacement === 'O' && guarded) continue
    if (!rule.pattern.test(value)) {
      rule.pattern.lastIndex = 0
      continue
    }
    rule.pattern.lastIndex = 0
    const next = value.replace(rule.pattern, rule.replacement)
    if (next === value) continue
    value = next
    changes.push(rule.label)
  }
  return { value, changes }
}

/** One human sentence describing what happened, or `''` when nothing did. */
function describe({ dropped, neutralized, mixture }) {
  const parts = []
  if (dropped.length > 0) parts.push(`${mixture ? 'kept the largest fragment, dropped' : 'dropped the counter-ion(s)'} ${dropped.join(' + ')}`)
  if (neutralized.length > 0) parts.push(`neutralised ${neutralized.join(', ')}`)
  return parts.join('; ')
}

/**
 * Turn one submitted line into the single molecule SwissTargetPrediction accepts.
 * @param input - the raw SMILES line.
 * @returns the submitted form, what was dropped or neutralised, and why.
 */
export function normalizeSubmission(input) {
  const original = String(input ?? '')
  const cleaned = cleanSmiles(original)
  if (cleaned === '') {
    return { input: original, submitted: '', changed: false, dropped: [], neutralized: [], mixture: false, note: '', error: 'the SMILES is empty' }
  }

  const components = splitComponents(cleaned)
  if (components.length === 0) {
    return { input: original, submitted: '', changed: false, dropped: [], neutralized: [], mixture: false, note: '', error: 'the SMILES has no molecule' }
  }

  const dropped = []
  let kept = components[0]
  let mixture = false

  if (components.length > 1) {
    const retained = components.filter(component => !isCounterIon(component))
    if (retained.length === 0) {
      return {
        input: original,
        submitted: '',
        changed: false,
        dropped: components,
        neutralized: [],
        mixture: false,
        note: '',
        error: 'every component is a counter-ion; SwissTargetPrediction predicts small organic molecules, not salts',
      }
    }
    if (retained.length === 1) {
      kept = retained[0]
      dropped.push(...components.filter(component => component !== kept))
    } else {
      mixture = true
      kept = retained.reduce((largest, candidate) => (heavyAtomCount(candidate) > heavyAtomCount(largest) ? candidate : largest), retained[0])
      dropped.push(...components.filter(component => component !== kept))
    }
  }

  const { value: submitted, changes } = neutralizeFragment(kept)
  if (submitted === '') {
    return { input: original, submitted: '', changed: false, dropped, neutralized: changes, mixture, note: '', error: 'the SMILES reduced to nothing' }
  }

  return {
    input: original,
    submitted,
    changed: submitted !== original,
    dropped,
    neutralized: changes,
    mixture,
    note: describe({ dropped, neutralized: changes, mixture })
      || (isCounterIon(kept) ? 'the input is a single ion; this service predicts small organic molecules' : ''),
    error: '',
  }
}
