import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  buildFoundationsOverviewModel,
  type FoundationsOverviewAvailability,
} from '../../src/readerShell/foundations/foundationsOverviewModel.ts'

test('default empty Foundations overview model is truthful, optional, non-punitive, and fabricates no actions or resources', () => {
  const model = buildFoundationsOverviewModel()

  assert.equal(model.availability, 'empty')
  assert.equal(model.title, 'Foundations')
  assert.equal(model.statusRole, 'status')
  assert.equal(model.primaryReadingAction, null)
  assert.deepEqual(model.resources, [])
  assert.match(model.eyebrow, /Optional/i)
  assert.match(model.intro, /optional/i)
  assert.match(model.statusHeading, /No Foundations readings are available yet/i)

  const combinedText = [
    model.eyebrow,
    model.title,
    model.intro,
    model.statusBadge,
    model.statusHeading,
    ...model.paragraphs,
  ].join(' ')

  assert.doesNotMatch(combinedText, /Resume Reading|Begin with the First Reading|Start Lesson/i)
  assert.doesNotMatch(combinedText, /behind|catch up|streak|mandatory/i)
  assert.doesNotMatch(combinedText, /Foundations & Learning|earn a card|unlock/i)
})

test('unavailable Foundations overview model uses alert semantics and remains optional and truthful', () => {
  const availability: FoundationsOverviewAvailability = 'unavailable'
  const model = buildFoundationsOverviewModel(availability)

  assert.equal(model.availability, 'unavailable')
  assert.equal(model.title, 'Foundations')
  assert.equal(model.statusRole, 'alert')
  assert.equal(model.primaryReadingAction, null)
  assert.deepEqual(model.resources, [])
  assert.match(model.statusBadge, /Unavailable/i)
  assert.match(model.statusHeading, /currently unavailable/i)

  const combinedText = [
    model.eyebrow,
    model.title,
    model.intro,
    model.statusBadge,
    model.statusHeading,
    ...model.paragraphs,
  ].join(' ')

  assert.doesNotMatch(combinedText, /Resume Reading|Begin with the First Reading|Start Lesson/i)
  assert.doesNotMatch(combinedText, /behind|catch up|streak|mandatory/i)
  assert.doesNotMatch(combinedText, /stack trace|HTTP|500|exception/i)
})
