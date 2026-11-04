import {challenge} from './documents/challenge'
import {challengeSeries} from './documents/challengeSeries'
import {challengeScreen} from './objects/challengeScreen'
import {companionLink} from './objects/companionLink'
import {comparisonBlock} from './objects/comparisonBlock'
import {comparisonSide} from './objects/comparisonSide'
import {connectedSequenceBlock} from './objects/connectedSequenceBlock'
import {editorialReview} from './objects/editorialReview'
import {importProvenance} from './objects/importProvenance'
import {optionalStudyBlock} from './objects/optionalStudyBlock'
import {prayerBlock} from './objects/prayerBlock'
import {reflectionBlock} from './objects/reflectionBlock'
import {reflectionChoice} from './objects/reflectionChoice'
import {richTextBlock} from './objects/richTextBlock'
import {scriptureBlock} from './objects/scriptureBlock'
import {scriptureReference} from './objects/scriptureReference'
import {sequenceStep} from './objects/sequenceStep'
import {statementBlock} from './objects/statementBlock'
import {visualCard} from './objects/visualCard'
import {visualCardsBlock} from './objects/visualCardsBlock'

export const schemaTypes = [
  challengeSeries,
  challenge,
  challengeScreen,
  scriptureReference,
  scriptureBlock,
  richTextBlock,
  statementBlock,
  comparisonSide,
  comparisonBlock,
  visualCard,
  visualCardsBlock,
  sequenceStep,
  connectedSequenceBlock,
  reflectionChoice,
  reflectionBlock,
  optionalStudyBlock,
  prayerBlock,
  companionLink,
  editorialReview,
  importProvenance,
]
