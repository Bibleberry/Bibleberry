import {defineType} from 'sanity'
import {portableTextField} from '../fields'

export const richTextBlock = defineType({
  name: 'richTextBlock',
  title: 'Rich teaching text',
  type: 'object',
  fields: [portableTextField()],
  preview: {
    select: {body: 'body'},
    prepare({body}) {
      const first = body?.find((item: {_type?: string}) => item._type === 'block')
      const text = first?.children?.map((child: {text?: string}) => child.text || '').join('') || 'Empty teaching text'
      return {title: text, subtitle: 'Rich teaching text'}
    },
  },
})
