export type TeachingBlock =
  | { type?: 'paragraph'; text: string; emphasis?: boolean }
  | { type: 'pullQuote'; text: string; label?: string }
  | { type: 'image'; src: string; alt: string; caption?: string; fit?: 'contain' | 'cover'; aspectRatio?: string }

export type Teaching = {
  id: string
  challengeId?: string
  date: string
  displayDate: string
  title: string
  scripture: string
  scriptureText: string
  author?: string
  status: 'Authentic teaching sample' | 'Draft archive fixture'
  series?: string
  introduction?: string
  body: TeachingBlock[]
  reflection?: string
  response?: string[]
  responseStart?: number
  prayer?: string[]
  truth?: string
  shortFormConcept?: string
  walkingReel?: string
}

export type Foundation = {
  id: string
  order: number
  title: string
  readingTime: string
  body: string[]
  reflection: string
  kind?: 'reading' | 'prayer'
}

export const novemberTeaching: Teaching = {
  id: 'november-5-gods-will',
  date: '2026-11-05',
  displayDate: 'November 5, 2026',
  title: 'God’s Will for Our Lives',
  scripture: '1 Thessalonians 5:16–18 (NIV)',
  scriptureText: '“Rejoice always, pray continually, give thanks in all circumstances; for this is God’s will for you in Christ Jesus.”',
  author: 'Alexis Waid',
  status: 'Authentic teaching sample',
  body: [
    { text: 'Rejoice always. Pray continually. Give thanks in all circumstances.' },
    { text: 'This is God’s will for our lives.', emphasis: true },
    { text: 'So today we’re circling back to the devotion that started this month, where I explained that God’s will for us isn’t necessarily hard to find.' },
    { text: 'Specifically, in 1 Thessalonians 5:16–18, Paul gives us three clear commands about how we are supposed to live in Christ Jesus.' },
    { text: 'And as we’ve gone through this week, we’ve learned that rejoicing isn’t the same as feeling joyful, praying isn’t restricted to going off somewhere for quiet time, and giving thanks isn’t just something we do when life is going well.' },
    { text: 'These are commands for how God wants His people to live.' },
    { text: 'And they’re not necessarily going to come naturally to us. Sure, sometimes we’ll rejoice, pray, or give thanks spontaneously and without much effort. But Paul isn’t telling us to practice these things only when we feel like it or when life gets difficult. He’s commanding us to practice all three continually, every single day. And that means intentionally choosing to rejoice, pray, and give thanks throughout our day, even in the most ordinary moments.' },
    { text: 'We spend a lot of time wondering about God’s will for our individual lives. What should I do? Where should I go? What decision should I make?' },
    { text: 'And certainly, there are things that are specific to our individual circumstances that require prayer, wisdom, and discernment.' },
    { text: 'But there are also commands God has given to all His people that aren’t mysterious at all. We don’t have to wonder whether God wants us to rejoice, pray, or give thanks. He’s already told us.' },
    { text: 'And I think it’s particularly interesting that Paul has corralled these three commands together.' },
    { text: 'Because when you think about it, they really do support one another.' },
    { text: 'When we practice rejoicing in the Lord, we’re turning our attention toward Him and remembering His goodness. And when we’re continually turning toward God, prayer becomes a more natural part of our lives.' },
    { text: 'And the more we remain in conversation with God, recognizing who He is and what He has done, the more reasons we begin to recognize for giving thanks.' },
    { text: 'And that gratitude gives us even more reason to rejoice!' },
    { text: 'Do you see how these three practices work together?' },
    { text: 'This is how we begin developing a different way of responding to life. Rather than allowing our circumstances to determine our relationship with God, we continually turn toward Him through rejoicing, prayer, and thanksgiving.' },
    { text: 'So today, I want you to try practicing all three together.' },
    { text: 'Whatever happens today, whether it’s something wonderful, something ordinary, or something difficult, take a moment to turn your attention toward God. Talk to Him about what’s happening. Remember who He is and what He has done, and find a reason to give thanks.' },
    { text: 'And remember, these aren’t just good Christian habits we’re trying to develop. They’re part of God’s will for how we are supposed to live in Christ Jesus.' },
  ],
  responseStart: 17,
  prayer: [
    'Lord, thank You for giving us clear instructions about how You want us to live. Help me to develop these practices of rejoicing, prayer, and thanksgiving in my everyday life. I know they won’t always come naturally to me, but I also know You have called me to practice them continually. Help me intentionally turn toward You throughout my day, whether things are going well, life is difficult, or I’m simply going about my normal routine. Continue forming my heart and mind so that rejoicing, prayer, and thanksgiving become a natural part of how I live in Christ.',
    'In Jesus’ name, amen.',
  ],
  walkingReel: 'Determining God’s will starts with what He has already revealed His will to be.',
}

export const archiveFixtures: Teaching[] = [
  {
    id: 'october-31-attention',
    date: '2026-10-31',
    displayDate: 'October 31, 2026',
    title: 'The Practice of Paying Attention',
    scripture: 'Psalm 46:10 (WEBP)',
    scriptureText: '“Be still, and know that I am God.”',
    status: 'Draft archive fixture',
    introduction: 'A short reflection on becoming still enough to notice God’s presence and the person in front of us.',
    body: [
      { text: 'Attention is a limited gift. Scripture invites us to become still enough to notice what hurry can obscure: God’s presence, our actual condition, and the person in front of us.' },
      { text: 'Consider choosing one ordinary moment today to pause without reaching for another input. Let stillness become an opportunity to listen rather than another task to perform.' },
    ],
  },
  {
    id: 'october-28-enough-for-today',
    date: '2026-10-28',
    displayDate: 'October 28, 2026',
    title: 'Enough Grace for Today',
    scripture: 'Matthew 6:34 (WEBP)',
    scriptureText: '“Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself. Each day’s own evil is sufficient.”',
    status: 'Draft archive fixture',
    introduction: 'A short reflection on receiving the day we have been given rather than borrowing tomorrow’s anxiety.',
    body: [
      { text: 'Tomorrow easily borrows our attention before it arrives. This passage brings us back to the day we have actually been given and the grace available within it.' },
      { text: 'You do not need to solve every future possibility before being present now. Name the next faithful step, and let that be enough for this moment.' },
    ],
  },
  {
    id: 'october-24-begin-again',
    date: '2026-10-24',
    displayDate: 'October 24, 2026',
    title: 'Permission to Begin Again',
    scripture: 'Lamentations 3:22–23 (WEBP)',
    scriptureText: '“It is because of Yahweh’s loving kindnesses that we are not consumed, because his compassion doesn’t fail. They are new every morning. Great is your faithfulness.”',
    status: 'Draft archive fixture',
    introduction: 'A short reflection on receiving mercy and beginning again without keeping a spiritual scoreboard.',
    body: [
      { text: 'Beginning again is not evidence that the earlier days were wasted. It can be a quiet act of trust: receiving mercy and returning to what matters.' },
      { text: 'There is no spiritual scoreboard hidden inside this library. Return to a passage because it serves you now, not because you owe the archive a debt.' },
    ],
  },
]

export const foundations: Foundation[] = [
  {
    id: 'what-realigned-means',
    order: 1,
    title: 'What Does It Mean to Be Realigned?',
    readingTime: 'About 2 minutes',
    body: [
      'Spiritual formation often begins with a quiet recognition: something in our pace, attention, or desires has drifted away from the life to which God is calling us.',
      'To be realigned is not to pretend that we have arrived. It is to become willing to notice where we are, bring that honestly before God, and take the next faithful step.',
      'Scripture gives us more than a thought for the day. It gives us a place to listen. A passage can interrupt our assumptions, comfort what is weary, correct what has become distorted, and draw our attention back to Christ.',
      'This app is built around that kind of attentive return. Some days you may read slowly and pray through every line. Other days you may have only a few minutes. Both can be meaningful. The aim is not to maintain a perfect record; it is to remain available to God’s work in ordinary life.',
    ],
    reflection: 'Where do you sense a need to pause, listen, or return your attention to God today?',
  },
  {
    id: 'no-catching-up',
    order: 2,
    title: 'You Don’t Have to Catch Up',
    readingTime: 'About 2 minutes',
    body: [
      'An archive can quietly start to feel like a list of everything you missed. That is not the purpose of this one.',
      'The Archive is a library, not a record of failure. Yesterday’s teaching is still available, but you do not need to work through every past day before you are allowed to be present today.',
      'Begin with the current Scripture Challenge if you want a shared daily rhythm. Explore an older entry if its title speaks to a present need. Spend time in Foundations if you are new and want orientation. There is no single correct amount to consume.',
      'Formation is not measured by how quickly you clear a queue. Make room for attention, reflection, prayer, and practice—even when that means reading less.',
    ],
    reflection: 'What would it look like to engage with one thing attentively rather than trying to keep up with everything?',
  },
  {
    id: 'simple-way-to-engage',
    order: 3,
    title: 'A Simple Way to Engage With a Scripture Challenge',
    readingTime: 'About 2 minutes',
    body: [
      'There is no required technique, but a simple pattern may help when you are not sure where to start.',
      'Pause. Before reading, take a breath and become present. You might pray, “Lord, help me listen.”',
      'Read the Scripture. Move slowly enough to notice repeated words, contrasts, commands, promises, and images. Read the passage again if that would help.',
      'Receive the teaching. Let the written teaching help you consider the passage without feeling pressured to agree before you have had time to reflect.',
      'Respond honestly. Use the optional prayer, journal elsewhere, discuss the passage with someone you trust, or identify one practical response.',
      'Return as needed. A teaching can be revisited. You do not have to extract everything from it in one sitting.',
      'Media can enrich the experience when it is available, but the Scripture and written teaching are complete on their own. Choose the form of engagement that serves your attention rather than treating every format as another box to check.',
    ],
    reflection: 'Which part of this pattern—pause, read, receive, respond, or return—would be most helpful for you today?',
  },
  {
    id: 'prayer-for-beginning',
    order: 4,
    title: 'A Prayer for Beginning',
    readingTime: 'Optional prayer',
    kind: 'prayer',
    body: [
      'Lord, thank you for meeting me in ordinary moments. Quiet what is hurried, distracted, or afraid. Help me receive your Word with honesty and attention. Show me the next faithful step, and give me grace to take it without pretending to be further along than I am. Let this beginning become not another demand, but an invitation to remain close to you. Amen.',
    ],
    reflection: 'This prayer is optional. You may pray it as written, use your own words, or simply remain quiet for a moment.',
  },
]

export const media = {
  youtube: {
    title: 'Unpacking the Biblical concept of abundance',
    url: 'https://www.youtube.com/shorts/ezCy-jxDxno',
    embed: 'https://www.youtube-nocookie.com/embed/ezCy-jxDxno',
  },
  walkingReel: {
    title: 'Christian anxiety and what to do',
    url: 'https://youtube.com/shorts/fx3N4U8r3Mo',
    embed: 'https://www.youtube-nocookie.com/embed/fx3N4U8r3Mo',
  },
  podcast: {
    title: 'What To Do When You’re Hurt',
    episodePage: 'https://realigned.simplecast.com/episodes/what-to-do-when-youre-hurt',
    embed: 'https://player.simplecast.com/f1523f41-0eda-4760-8045-d693cc1e8563?dark=true',
    apple: 'https://podcasts.apple.com/us/podcast/what-to-do-when-youre-hurt/id1778562224?i=1000787461411',
    spotify: 'https://open.spotify.com/episode/0smzXLn4SM5RFAabdZoJiX',
  },
}
