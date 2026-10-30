import type { MemorizationEntry } from './formation'

export type LabScripture = {
  id: string
  reference: string
  translation: string
  passage?: string
  textStatus: 'provided' | 'referenceOnly'
  practiceStatus: 'configured' | 'notConfigured'
}

type BlockBase = { id: string; draftEditorial?: boolean }

export type LabBlock = BlockBase & (
  | { type: 'scripture'; scripture: LabScripture }
  | { type: 'teachingText'; paragraphs: string[]; pullQuote?: string }
  | { type: 'visualCards'; cards: { title: string; body?: string }[] }
  | { type: 'contrast'; left: { title: string; paragraphs: string[] }; right: { title: string; paragraphs: string[] }; footer?: string }
  | { type: 'connectedSequence'; steps: { title: string; body: string }[]; cycle?: boolean; conclusion?: string }
  | { type: 'reflectionChoice'; question: string; choices: { id: string; label: string; prompt: string; draftEditorial: true }[]; closing?: string }
  | { type: 'prayer'; paragraphs: string[] }
  | { type: 'optionalExploration'; title: string; paragraphs: string[]; scriptures: LabScripture[]; draftEditorial: true }
  | { type: 'relatedResource'; title: string; description: string; availability?: string }
)

export type LabScreen = {
  id: string
  stepLabel: string
  title: string
  blocks: LabBlock[]
}

export type InteractiveChallenge = {
  id: 'nov-1' | 'nov-2' | 'nov-3' | 'nov-5'
  shortDate: 'Nov 1' | 'Nov 2' | 'Nov 3' | 'Nov 5'
  date: string
  displayDate: string
  title: string
  screens: LabScreen[]
  relatedResources: Extract<LabBlock, { type: 'relatedResource' }>[]
}

export const primaryScripture: LabScripture = {
  id: '1-thessalonians-5-16-18-niv',
  reference: '1 Thessalonians 5:16–18',
  translation: 'NIV',
  passage: 'Rejoice always, pray continually, give thanks in all circumstances; for this is God’s will for you in Christ Jesus.',
  textStatus: 'provided',
  practiceStatus: 'configured',
}

const referenceOnly = (id: string, reference: string): LabScripture => ({
  id,
  reference,
  translation: 'Not configured',
  textStatus: 'referenceOnly',
  practiceStatus: 'notConfigured',
})

const scriptureBlock = (id: string): LabBlock => ({ id, type: 'scripture', scripture: primaryScripture })

export const labMemorizationEntry: MemorizationEntry = {
  id: 'interactive-lab-1-thessalonians-5-16-18',
  challengeId: 'interactive-challenge-lab',
  date: '2026-11-01',
  displayDate: 'November 1, 2026',
  title: '1 Thessalonians 5:16–18',
  series: 'Interactive Challenge Lab · My Scripture',
  status: 'Development fixture',
  entryType: 'memorization',
  content: {
    reference: primaryScripture.reference,
    translation: primaryScripture.translation,
    passage: primaryScripture.passage!,
    segments: [
      'Rejoice always,',
      'pray continually,',
      'give thanks in all circumstances;',
      'for this is God’s will for you in Christ Jesus.',
    ],
    instructions: 'Reveal one phrase at a time, then conceal them and begin again whenever you are ready.',
  },
}

export const interactiveChallenges: InteractiveChallenge[] = [
  {
    id: 'nov-1',
    shortDate: 'Nov 1',
    date: '2026-11-01',
    displayDate: 'November 1, 2026',
    title: 'God’s Will: Three Commands',
    screens: [
      {
        id: 'a1', stepLabel: 'Encounter', title: 'What is God’s will for us?',
        blocks: [
          scriptureBlock('a1-scripture'),
          { id: 'a1-opening', type: 'teachingText', paragraphs: ['We often wonder what God’s will is for us, and we don\'t need to dig too far into the Bible to see that God has called each of His followers to live a life that includes three things:'] },
          { id: 'a1-cards', type: 'visualCards', cards: [{ title: 'Rejoicing' }, { title: 'Praying' }, { title: 'Gratitude' }] },
        ],
      },
      {
        id: 'a2', stepLabel: 'Understand', title: 'Three choices that belong to our identity',
        blocks: [
          { id: 'a2-calling', type: 'teachingText', paragraphs: [
            'While these are not the only things we are called to, Paul’s exhortation is purposefully clear in this instance. Part of our daily calling is to live in the head and heart space of rejoicing, prayer, and gratitude.',
            'These three choices, and yes, indeed they are choices, are supposed to be part of our identity in Christ.',
          ] },
          { id: 'a2-commands', type: 'visualCards', cards: [
            { title: 'Rejoice always', body: 'Always' },
            { title: 'Pray continually', body: 'Continually' },
            { title: 'Give thanks in all circumstances', body: 'In all circumstances' },
          ] },
          { id: 'a2-ongoing', type: 'teachingText', paragraphs: [
            'Paul uses the words always, continually, and in all circumstances, which all convey an ongoing way of life. And this isn’t just Paul suggesting these things as something we pick à la carte, but rather these are biblical commands.',
          ] },
          { id: 'a2-greek', type: 'optionalExploration', title: 'Explore the language of these commands', draftEditorial: true, paragraphs: [
            'Paul uses three Greek imperative verbs addressed to the community of believers: chairete (rejoice), proseuchesthe (pray), and eucharisteite (give thanks). The expressions “always,” “continually,” and “in all circumstances” specify the ongoing scope of these commands. The point isn\'t that these actions happen only during specially designated religious moments.',
          ], scriptures: [] },
        ],
      },
      {
        id: 'a3', stepLabel: 'Consider', title: 'Small verses, serious commands',
        blocks: [
          { id: 'a3-text', type: 'teachingText', paragraphs: [
            'They may be some of the shortest verses in all of the Bible, but they pack a lot of punch and can make us feel a bit uneasy or even set up for failure.',
            'So before we begin unpacking these commands, I want you to consider your own response to them.',
          ] },
        ],
      },
      {
        id: 'a4', stepLabel: 'Reflect', title: 'Which command gives you pause?',
        blocks: [
          { id: 'a4-reflection', type: 'reflectionChoice', question: 'Which of those three commands makes you stop and think, “Okay, but how am I supposed to do that?”', choices: [
            { id: 'rejoice', label: 'Rejoice always', prompt: 'What makes rejoicing difficult to imagine when you don\'t feel joyful?', draftEditorial: true },
            { id: 'pray', label: 'Pray continually', prompt: 'What would continual prayer look like alongside your ordinary responsibilities?', draftEditorial: true },
            { id: 'thanks', label: 'Give thanks in all circumstances', prompt: 'What circumstances make thanksgiving difficult to understand or practice?', draftEditorial: true },
          ], closing: 'Think about that today. Over the next few days, we\'re going to take a closer look at what Paul means by each of these commands and what they actually look like in our daily lives.' },
        ],
      },
      {
        id: 'a5', stepLabel: 'Pray', title: 'A prayer for the journey',
        blocks: [
          { id: 'a5-prayer', type: 'prayer', paragraphs: [
            'Lord, help me to embrace Paul\'s teaching here in 1 Thessalonians 5. Help me to open my heart and mind to living out Your commands of rejoicing always, praying continually, and being thankful in all circumstances.',
            'As I journey through this month\'s gratitude challenge, help me to stay committed to this, as I know You will show up if I show up.',
            'Thank You for everything You have done and will continue to do.',
            'In Jesus\' name, amen.',
          ] },
        ],
      },
    ],
    relatedResources: [
      { id: 'a-social', type: 'relatedResource', title: 'Social follow-on', description: 'Make sure you’re following on your preferred social media later today I will be posting a deeper look at the fruit of practicing rejoicing. (TT, YT, IG, FB)', availability: 'Editorial metadata only · No link supplied' },
      { id: 'a-patreon', type: 'relatedResource', title: 'Ministry support', description: 'Want to help fund this formation initiative, head over to my patreon for 5 dollars you can help me reach more people and help fund my ministry efforts to help people be continually formed in Christ through Scripture.', availability: 'Editorial metadata only · Not part of the Challenge' },
      { id: 'a-reel', type: 'relatedResource', title: 'Walking Reel concept', description: 'Thoughts on commands from God. we often think of commands as being Old Testament things, but theres quite a collection of commands in the new testament as well, they didnt end when JEsus came.', availability: 'Related concept · Not required teaching' },
    ],
  },
  {
    id: 'nov-2',
    shortDate: 'Nov 2',
    date: '2026-11-02',
    displayDate: 'November 2, 2026',
    title: 'Rejoice Always',
    screens: [
      {
        id: 'b1', stepLabel: 'Encounter', title: 'Rejoice always. But how?',
        blocks: [
          scriptureBlock('b1-scripture'),
          { id: 'b1-text', type: 'teachingText', paragraphs: [
            'Well, how is someone supposed to do that?',
            'Joy often feels spontaneous, right? It can come unexpectedly, or we can anticipate it with things like holidays, spending time with friends, or doing something we really enjoy.',
            'But Paul doesn\'t command us to feel joy always. He commands us to rejoice always. And there\'s a difference.',
          ] },
        ],
      },
      {
        id: 'b2', stepLabel: 'Distinguish', title: 'Feeling joyful is not the same as rejoicing',
        blocks: [
          { id: 'b2-contrast', type: 'contrast', draftEditorial: true, left: {
            title: 'Feeling joy',
            paragraphs: ['An emotion that can arise unexpectedly or in anticipated enjoyable experiences.'],
          }, right: {
            title: 'Choosing to rejoice',
            paragraphs: ['Rejoicing isn\'t dependent on feeling joyful. It\'s a position of the heart and mind. It\'s choosing to recognize God\'s goodness even when our circumstances are difficult or far from ideal.'],
          }, footer: 'It\'s remembering that God is good even when life isn\'t going well. And when things are going well, it\'s recognizing that God is the source of everything we have.' },
        ],
      },
      {
        id: 'b3', stepLabel: 'Clarify', title: 'Rejoicing isn’t pretending',
        blocks: [
          { id: 'b3-text', type: 'teachingText', paragraphs: [
            'But rejoicing also isn\'t putting on rose-colored glasses and pretending everything is wonderful just so we can say we\'re following Paul\'s command.',
            'God doesn\'t ask us to pretend that everything is fine. In fact, Scripture gives us countless examples of people who experienced tremendous suffering, grief, and disappointment. We even see Jesus Himself weeping.',
          ], pullQuote: 'So how can we rejoice in a world filled with so much pain and difficulty?' },
          { id: 'b3-john', type: 'optionalExploration', title: 'Explore Jesus and human grief — John 11:33–35', draftEditorial: true, paragraphs: [
            'In John 11, Jesus encounters the grief surrounding Lazarus\'s death. He is deeply moved and weeps. His example is important here: Christian rejoicing cannot be reduced to suppressing sorrow.',
          ], scriptures: [referenceOnly('john-11-33-35', 'John 11:33–35')] },
          { id: 'b3-corinthians', type: 'optionalExploration', title: 'Explore sorrow and rejoicing together — 2 Corinthians 6:10', draftEditorial: true, paragraphs: [
            'Paul describes his ministry as “sorrowful, yet always rejoicing” (2 Corinthians 6:10). Sorrow and rejoicing are not treated as mutually exclusive experiences.',
          ], scriptures: [referenceOnly('2-corinthians-6-10', '2 Corinthians 6:10')] },
        ],
      },
      {
        id: 'b4', stepLabel: 'Gospel', title: 'We have to remember the Gospel',
        blocks: [
          { id: 'b4-cards', type: 'visualCards', cards: [
            { title: 'A world broken by sin', body: 'We live in a world that has been broken by sin.' },
            { title: 'God has not abandoned us', body: 'But God has not abandoned us to that brokenness.' },
            { title: 'Jesus Christ', body: 'He sent His Son, Jesus Christ, to atone for the sins of humanity and reconcile us to Himself.' },
          ] },
          { id: 'b4-text', type: 'teachingText', paragraphs: [
            'We know that what we experience in this broken world is not the end of the story.',
          ], pullQuote: 'And that\'s where our rejoicing comes from.' },
        ],
      },
      {
        id: 'b5', stepLabel: 'Hope', title: 'What God has done, is doing, and will do',
        blocks: [
          { id: 'b5-sequence', type: 'connectedSequence', draftEditorial: true, steps: [
            { title: 'What God has done', body: 'Jesus Christ came to atone for sin and reconcile us to God.' },
            { title: 'What God is doing', body: 'Through Jesus, God has already begun the work of redemption.' },
            { title: 'What God has promised', body: 'One day He will make all things new. Present brokenness is not the final story.' },
          ] },
          { id: 'b5-text', type: 'teachingText', paragraphs: [
            'When we understand this, we begin to see that rejoicing isn\'t dependent on whether we\'re having a good day or a bad one. It\'s rooted in what God has done, what He is doing, and what He has promised to do.',
            'It\'s learning to keep our eyes on God and His kingdom even when the circumstances right in front of us are difficult. It\'s learning to respond to this broken world with our hearts and minds fixed on the Lord, just as Jesus demonstrated throughout His earthly life.',
          ] },
          { id: 'b5-renewal', type: 'optionalExploration', title: 'Explore the promise of renewal — Romans 8:18–25 and Revelation 21:1–5', draftEditorial: true, paragraphs: [
            'Romans 8 describes creation\'s groaning and the hope of redemption. Revelation 21 presents the new creation and God\'s promise to make all things new. Both passages enlarge the future hope Alexis identifies as the basis for Christian rejoicing.',
          ], scriptures: [referenceOnly('romans-8-18-25', 'Romans 8:18–25'), referenceOnly('revelation-21-1-5', 'Revelation 21:1–5')] },
        ],
      },
      {
        id: 'b6', stepLabel: 'Practice', title: 'Rejoicing in real circumstances',
        blocks: [
          { id: 'b6-text', type: 'teachingText', paragraphs: [
            'And as we learn to rejoice in the Lord regardless of our circumstances, something else begins to happen. We become more aware of just how much we have to be thankful for.',
          ] },
          { id: 'b6-reflection', type: 'reflectionChoice', question: 'So today, I want you to practice rejoicing.', choices: [
            { id: 'wonderful', label: 'Something wonderful happens', prompt: 'Recognize God\'s goodness and that He is the source of what we have.', draftEditorial: true },
            { id: 'difficult', label: 'Something difficult happens', prompt: 'Remember who God is and what He has done through Jesus, without denying suffering.', draftEditorial: true },
          ], closing: 'Remember, rejoicing isn\'t pretending everything is good. It\'s remembering that God is good.' },
        ],
      },
      {
        id: 'b7', stepLabel: 'Pray', title: 'A prayer for today',
        blocks: [
          { id: 'b7-prayer', type: 'prayer', paragraphs: [
            'Lord, help me choose to actively rejoice in You throughout my day. Help me develop this practice so that it becomes a natural part of how I respond to life. When things are going well, remind me to recognize Your goodness. And when life is difficult, help me keep my eyes on You and remember what You have done for me through Jesus. Continue forming my heart and mind so that I may become more like Christ. In Jesus\' name, amen.',
          ] },
        ],
      },
    ],
    relatedResources: [
      { id: 'b-social', type: 'relatedResource', title: 'Social follow-on', description: 'Make sure you\'re following me on your preferred social media platform. Later today, I\'ll be sharing a deeper look at the fruit of practicing rejoicing.', availability: 'Editorial metadata only · No link supplied' },
      { id: 'b-patreon', type: 'relatedResource', title: 'Ministry support', description: 'If you\'d like to help fund this biblical formation ministry, consider becoming a Patreon supporter for $5 a month. Your support helps me continue providing free Scripture teaching and resources to help Christians grow in their understanding of God\'s Word and live in response to it.', availability: 'Editorial metadata only · Not part of the Challenge' },
    ],
  },
  {
    id: 'nov-3',
    shortDate: 'Nov 3',
    date: '2026-11-03',
    displayDate: 'November 3, 2026',
    title: 'Pray Continually',
    screens: [
      {
        id: 'c1', stepLabel: 'Encounter', title: 'How can anyone pray continually?',
        blocks: [
          scriptureBlock('c1-scripture'),
          { id: 'c1-text', type: 'teachingText', paragraphs: [
            'Of the three commands Paul gives, this might be the one that gives us the most pause. Because how in the world does someone pray continually?',
            'I mean, we can\'t pray all the time, right? We have obligations, responsibilities, and duties we have to take care of every day. We can\'t constantly stop what we\'re doing and go off somewhere to pray.',
          ] },
        ],
      },
      {
        id: 'c2', stepLabel: 'Rethink', title: 'Prayer is bigger than a quiet-time routine',
        blocks: [
          { id: 'c2-text', type: 'teachingText', paragraphs: [
            'But that\'s not what Paul is commanding. He\'s not telling us to continually go off and pray. He\'s telling us to pray continually. And there\'s a difference.',
          ] },
          { id: 'c2-contrast', type: 'contrast', left: {
            title: 'Dedicated times and settings',
            paragraphs: ['There are all kinds of ways to pray. Of course, the ones we\'re probably most familiar with are solitary prayer and corporate prayer (praying with other believers).'],
          }, right: {
            title: 'Prayer in ordinary life',
            paragraphs: ['But prayer isn\'t restricted to one type of communication or setting.', 'We can talk to God anytime and anywhere. In fact, that\'s what Paul is commanding us to do.'],
          }, footer: 'We just have to realign our perspective to recognize this opportunity that\'s always available to us.' },
          { id: 'c2-luke', type: 'optionalExploration', title: 'Explore Jesus\' prayer practices — Luke 5:16', draftEditorial: true, paragraphs: [
            'Luke 5:16 describes Jesus regularly withdrawing to solitary places to pray. Dedicated times of prayer are important, yet Alexis\'s distinction here is that continual prayer is not limited to those settings.',
          ], scriptures: [referenceOnly('luke-5-16', 'Luke 5:16')] },
        ],
      },
      {
        id: 'c3', stepLabel: 'Notice', title: 'Prayer in ordinary moments',
        blocks: [
          { id: 'c3-text', type: 'teachingText', paragraphs: ['We can talk to God anytime and anywhere.'] },
          { id: 'c3-cards', type: 'visualCards', cards: [
            { title: 'While we\'re driving', body: 'We can have a conversation with God.' },
            { title: 'In the grocery line', body: 'While we\'re standing in line at the grocery store, we can have an inner dialogue with Him.' },
            { title: 'In the doctor\'s office', body: 'While we\'re sitting in a doctor\'s office, we can have an inner dialogue with Him.' },
          ] },
        ],
      },
      {
        id: 'c4', stepLabel: 'Reflect', title: 'What fills the silence?',
        blocks: [
          { id: 'c4-text', type: 'teachingText', paragraphs: [
            'But here\'s what often happens. We fill even the simplest, quietest moments of our lives with noise. We reach for our phones, turn on music, listen to something, or find another way to occupy our attention.',
          ] },
          { id: 'c4-reflection', type: 'reflectionChoice', draftEditorial: true, question: 'What do you automatically reach for in a quiet moment?', choices: [
            { id: 'phone', label: 'My phone', prompt: 'The next time you reach for your phone in a quiet moment, what might it be like to talk with God instead?', draftEditorial: true },
            { id: 'audio', label: 'Music or audio', prompt: 'Could this quiet moment become an opportunity to talk with God instead of turning on music or audio?', draftEditorial: true },
            { id: 'other', label: 'Something else', prompt: 'What would it look like to include God in this moment rather than fill the silence?', draftEditorial: true },
          ] },
          { id: 'c4-podcast', type: 'relatedResource', title: 'Realigned podcast · Prayer and noise', description: 'In fact, I have a Realigned podcast episode that was released today about prayer and noise, where I explore just how loud our lives have become and why that makes it difficult to find the time, or even the desire, to pray.', availability: 'Non-playing reference · No episode URL or player supplied' },
        ],
      },
      {
        id: 'c5', stepLabel: 'Reorient', title: 'Switch on a different mode',
        blocks: [
          { id: 'c5-text', type: 'teachingText', paragraphs: [
            'But continual prayer goes beyond those little moments of waiting throughout the day.',
            'We have opportunities all day long to be in open conversation with God. We just often don\'t have that “mode” switched on.',
          ] },
          { id: 'c5-contrast', type: 'contrast', left: {
            title: 'Occasional activity',
            paragraphs: ['We tend to think of prayer as something we do at scheduled times or when a crisis comes along. We pray before meals, during our quiet time, at church, or when something goes wrong and we desperately need God\'s help.'],
          }, right: {
            title: 'Part of how we live',
            paragraphs: ['But what Paul is telling us in this powerful little verse is that prayer isn\'t supposed to be something we occasionally stop our lives to do. It\'s supposed to be part of how we live.'],
          } },
        ],
      },
      {
        id: 'c6', stepLabel: 'Understand', title: 'Our connection to God is our oxygen',
        blocks: [
          { id: 'c6-text', type: 'teachingText', paragraphs: [
            'And not only is continual prayer a command, it\'s a necessity.',
            'Our connection to God is our oxygen. We desperately need Him.',
          ] },
          { id: 'c6-sequence', type: 'connectedSequence', draftEditorial: true, steps: [
            { title: 'Turn toward Him', body: 'The more we turn to Him throughout our days, the more we keep that conversation open.' },
            { title: 'Recognize His presence and work', body: 'The more we begin to recognize His presence and work in our lives.' },
            { title: 'Depend on Him', body: 'As we continue to depend on Him, we allow the Holy Spirit to form our hearts and minds.' },
            { title: 'See the Fruit of the Spirit', body: 'We begin to see more of the Fruit of the Spirit in how we live.' },
          ] },
          { id: 'c6-nehemiah', type: 'optionalExploration', title: 'A prayer in the middle of responsibility — Nehemiah 2:4–5', draftEditorial: true, paragraphs: [
            'When Nehemiah is questioned by the king, he prays to the God of heaven and then answers. It\'s an example of prayer while engaged in another responsibility.',
          ], scriptures: [referenceOnly('nehemiah-2-4-5', 'Nehemiah 2:4–5')] },
        ],
      },
      {
        id: 'c7', stepLabel: 'Practice', title: 'From continual prayer to thanksgiving',
        blocks: [
          { id: 'c7-text', type: 'teachingText', paragraphs: [
            'And for the purposes of this month\'s gratitude challenge, I want you to see how continual prayer can lead us into a life of thanksgiving. The more we\'re talking to God throughout our day, the more opportunities we have to recognize His goodness and thank Him.',
            'So today, I want you to pay attention to those moments when you automatically reach for something to fill the silence. Instead, try talking to God. It doesn\'t have to be a long prayer or anything particularly profound. Just begin including Him in the ordinary moments of your day.',
          ], pullQuote: 'It doesn\'t have to be a long prayer or anything particularly profound.' },
        ],
      },
      {
        id: 'c8', stepLabel: 'Pray', title: 'A prayer for continual prayer',
        blocks: [
          { id: 'c8-prayer', type: 'prayer', paragraphs: [
            'Lord, help me to develop a life of continual prayer. Open my eyes to the many opportunities I have throughout the day to talk with You. Help me recognize when I\'m filling my life with unnecessary noise and teach me to turn to You instead. I want prayer to become a natural part of my everyday life, not just something I do at certain times. Help me grow in my relationship with You and remain close to You throughout my day. In Jesus\' name, amen.',
          ] },
        ],
      },
    ],
    relatedResources: [
      { id: 'c-reel', type: 'relatedResource', title: 'Walking Reel concept', description: 'How to pray continually-brother lawrence practicing the presence', availability: 'Related concept · No biographical additions' },
    ],
  },
  {
    id: 'nov-5',
    shortDate: 'Nov 5',
    date: '2026-11-05',
    displayDate: 'November 5, 2026',
    title: 'God’s Will for Our Lives',
    screens: [
      {
        id: 'd1', stepLabel: 'Encounter', title: 'God’s Will for Our Lives',
        blocks: [
          scriptureBlock('d1-scripture'),
          { id: 'd1-text', type: 'teachingText', paragraphs: [
            'Rejoice always. Pray continually. Give thanks in all circumstances.',
            'This is God\'s will for our lives.',
          ] },
          { id: 'd1-context', type: 'optionalExploration', title: 'Explore the historical context — The Thessalonians and suffering', draftEditorial: true, paragraphs: [
            'Paul wrote to believers who had encountered opposition and suffering. See 1 Thessalonians 1:6 and 2:14. This matters for interpreting commands to rejoice and give thanks in all circumstances; they were not written only for people with comfortable lives.',
          ], scriptures: [referenceOnly('1-thessalonians-1-6', '1 Thessalonians 1:6'), referenceOnly('1-thessalonians-2-14', '1 Thessalonians 2:14')] },
        ],
      },
      {
        id: 'd2', stepLabel: 'Remember', title: 'Three distinctions learned this week',
        blocks: [
          { id: 'd2-text', type: 'teachingText', paragraphs: [
            'So today we\'re circling back to the devotion that started this month, where I explained that God\'s will for us isn\'t necessarily hard to find.',
            'Specifically, in 1 Thessalonians 5:16–18, Paul gives us three clear commands about how we are supposed to live in Christ Jesus.',
          ] },
          { id: 'd2-cards', type: 'visualCards', cards: [
            { title: 'Rejoicing', body: 'Rejoicing isn\'t the same as feeling joyful.' },
            { title: 'Praying', body: 'Praying isn\'t restricted to going off somewhere for quiet time.' },
            { title: 'Thanksgiving', body: 'Giving thanks isn\'t just something we do when life is going well.' },
          ] },
          { id: 'd2-conclusion', type: 'teachingText', paragraphs: ['These are commands for how God wants His people to live.'] },
        ],
      },
      {
        id: 'd3', stepLabel: 'Practice intentionally', title: 'What if it doesn’t come naturally?',
        blocks: [
          { id: 'd3-contrast', type: 'contrast', left: {
            title: 'Sometimes spontaneous',
            paragraphs: ['Sure, sometimes we\'ll rejoice, pray, or give thanks spontaneously and without much effort.'],
          }, right: {
            title: 'Intentional daily practice',
            paragraphs: ['But Paul isn\'t telling us to practice these things only when we feel like it or when life gets difficult. He\'s commanding us to practice all three continually, every single day. And that means intentionally choosing to rejoice, pray, and give thanks throughout our day, even in the most ordinary moments.'],
          } },
          { id: 'd3-greek', type: 'optionalExploration', title: 'Explore the original Greek', draftEditorial: true, paragraphs: [
            'The three verbs are present-tense imperatives—chairete, proseuchesthe, eucharisteite. The accompanying adverbial expressions “always,” “continually,” and “in all circumstances” make their ongoing scope especially clear.',
          ], scriptures: [] },
        ],
      },
      {
        id: 'd4', stepLabel: 'Discern', title: 'What is God’s will for me?',
        blocks: [
          { id: 'd4-text', type: 'teachingText', paragraphs: [
            'We spend a lot of time wondering about God\'s will for our individual lives. What should I do? Where should I go? What decision should I make?',
            'And certainly, there are things that are specific to our individual circumstances that require prayer, wisdom, and discernment.',
            'But there are also commands God has given to all His people that aren\'t mysterious at all. We don\'t have to wonder whether God wants us to rejoice, pray, or give thanks. He\'s already told us.',
          ] },
          { id: 'd4-sanctification', type: 'optionalExploration', title: 'Explore another passage on God\'s will — 1 Thessalonians 4:3', draftEditorial: true, paragraphs: [
            'Earlier in the same letter, Paul explicitly identifies sanctification as God\'s will for believers. The connection helps clarify that Scripture speaks about God\'s will in terms of Christian living, not only individual decisions.',
          ], scriptures: [referenceOnly('1-thessalonians-4-3', '1 Thessalonians 4:3')] },
        ],
      },
      {
        id: 'd5', stepLabel: 'Connect', title: 'Three practices that reinforce one another',
        blocks: [
          { id: 'd5-text', type: 'teachingText', paragraphs: [
            'And I think it\'s particularly interesting that Paul has corralled these three commands together. Because when you think about it, they really do support one another.',
          ] },
          { id: 'd5-sequence', type: 'connectedSequence', draftEditorial: true, cycle: true, steps: [
            { title: 'Rejoicing', body: 'When we practice rejoicing in the Lord, we turn our attention toward Him and remember His goodness. As we continually turn toward God, prayer becomes a more natural part of our lives.' },
            { title: 'Prayer', body: 'The more we remain in conversation with God, recognizing who He is and what He has done, the more reasons we begin to recognize for giving thanks.' },
            { title: 'Thanksgiving', body: 'And that gratitude gives us even more reason to rejoice!' },
          ], conclusion: 'Do you see how these three practices work together?' },
          { id: 'd5-philippians', type: 'optionalExploration', title: 'Explore the connection in Philippians — Philippians 4:4–7', draftEditorial: true, paragraphs: [
            'Paul brings rejoicing, prayer, and thanksgiving together in Philippians 4:4–7 as well. There he addresses anxiety and directs believers to bring requests to God.',
          ], scriptures: [referenceOnly('philippians-4-4-7', 'Philippians 4:4–7')] },
        ],
      },
      {
        id: 'd6', stepLabel: 'Respond', title: 'A different way of responding to life',
        blocks: [
          { id: 'd6-contrast', type: 'contrast', draftEditorial: true, left: {
            title: 'Circumstances determining the relationship',
            paragraphs: ['Rather than allowing our circumstances to determine our relationship with God.'],
          }, right: {
            title: 'Continually turning toward Him',
            paragraphs: ['We continually turn toward Him through rejoicing, prayer, and thanksgiving.'],
          }, footer: 'This is how we begin developing a different way of responding to life.' },
        ],
      },
      {
        id: 'd7', stepLabel: 'Apply', title: 'Practice all three together',
        blocks: [
          { id: 'd7-text', type: 'teachingText', paragraphs: [
            'So today, I want you to try practicing all three together.',
            'Whatever happens today, whether it\'s something wonderful, something ordinary, or something difficult, take a moment to turn your attention toward God.',
          ] },
          { id: 'd7-sequence', type: 'connectedSequence', draftEditorial: true, steps: [
            { title: 'Rejoice', body: 'Turn your attention toward God. Remember who He is and what He has done.' },
            { title: 'Pray', body: 'Talk to Him about what\'s happening.' },
            { title: 'Give thanks', body: 'Find a reason to give thanks.' },
          ] },
          { id: 'd7-conclusion', type: 'teachingText', paragraphs: [
            'And remember, these aren\'t just good Christian habits we\'re trying to develop. They\'re part of God\'s will for how we are supposed to live in Christ Jesus.',
          ] },
        ],
      },
      {
        id: 'd8', stepLabel: 'Pray', title: 'A prayer for today',
        blocks: [
          { id: 'd8-prayer', type: 'prayer', paragraphs: [
            'Lord, thank You for giving us clear instructions about how You want us to live. Help me to develop these practices of rejoicing, prayer, and thanksgiving in my everyday life. I know they won\'t always come naturally to me, but I also know You have called me to practice them continually. Help me intentionally turn toward You throughout my day, whether things are going well, life is difficult, or I\'m simply going about my normal routine. Continue forming my heart and mind so that rejoicing, prayer, and thanksgiving become a natural part of how I live in Christ.',
            'In Jesus\' name, amen.',
          ] },
        ],
      },
    ],
    relatedResources: [
      { id: 'd-reel', type: 'relatedResource', title: 'Walking Reel concept', description: 'Determining God’s will starts with what He has already revealed His will to be.', availability: 'Related takeaway · Not a substitute for the full teaching' },
    ],
  },
]

export function normalizeScriptureIdentity(reference: string, translation: string) {
  const normalizedReference = reference
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
  return `${normalizedReference}|${translation.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`
}
