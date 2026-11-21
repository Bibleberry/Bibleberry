/*
 * Bibleberry R06 Connected Experience Prototype — Deterministic Synthetic Fixtures & G09 Presets
 *
 * Notice: All months, Challenge titles, manuscripts, Scripture Cards, News items, and account
 * records in this file are clearly marked SYNTHETIC FIXTURES for interactive UX validation only.
 * They do not represent published ministry copy, final theological content, or live backend state.
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.Fixtures = (function () {
  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function daysInMonth(year, month1Based) {
    return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatYearMonth(ym) {
    var parts = ym.split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    return MONTH_NAMES[m - 1] + ' ' + y;
  }

  function formatCivilDate(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    var parts = isoDate.split('-');
    return MONTH_NAMES[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
  }

  function formatShortDate(isoDate) {
    var parts = isoDate.split('-');
    return SHORT_MONTHS[Number(parts[1]) - 1] + ' ' + Number(parts[2]);
  }

  function dayOfWeekUtc(isoDate) {
    var parts = isoDate.split('-');
    var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return WEEKDAYS[dt.getUTCDay()];
  }

  /**
   * Groups all civil days of a publication month into chronological Monday–Sunday weeks.
   */
  function buildMondaySundayWeeks(yearMonth, challenges) {
    var weeks = [];
    var currentWeek = null;
    for (var i = 0; i < challenges.length; i++) {
      var ch = challenges[i];
      var parts = ch.date.split('-');
      var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      var dow = dt.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
      if (!currentWeek || dow === 1) {
        currentWeek = {
          weekIndex: weeks.length + 1,
          items: []
        };
        weeks.push(currentWeek);
      }
      currentWeek.items.push(ch);
    }
    return weeks.map(function (w, idx) {
      var first = w.items[0];
      var last = w.items[w.items.length - 1];
      var rangeLabel = first.date === last.date
        ? formatShortDate(first.date)
        : formatShortDate(first.date) + ' – ' + formatShortDate(last.date);
      return {
        weekIndex: idx + 1,
        label: 'Week ' + (idx + 1),
        rangeLabel: rangeLabel,
        items: w.items
      };
    });
  }

  /* --------------------------------------------------------------------------
   * Synthetic Challenge Screen Builder
   * -------------------------------------------------------------------------- */
  var SYNTHETIC_PASSAGES = [
    { book: 'Psalms', reference: 'Psalm 23:1–3', text: 'Synthetic passage placeholder referencing the Good Shepherd who restores and leads beside quiet waters.' },
    { book: 'Matthew', reference: 'Matthew 11:28–30', text: 'Synthetic passage placeholder referencing Christ’s gentle invitation to rest and unhurried discipleship.' },
    { book: 'Romans', reference: 'Romans 12:9–13', text: 'Synthetic passage placeholder referencing sincere love, patient endurance, and everyday hospitality.' },
    { book: 'Isaiah', reference: 'Isaiah 40:28–31', text: 'Synthetic passage placeholder referencing renewed strength for those who wait quietly upon the Lord.' },
    { book: 'Proverbs', reference: 'Proverbs 3:5–6', text: 'Synthetic passage placeholder referencing wholehearted trust and steady direction along straight paths.' },
    { book: 'Colossians', reference: 'Colossians 3:12–15', text: 'Synthetic passage placeholder referencing compassion, kindness, humility, and the peace of Christ.' },
    { book: 'Philippians', reference: 'Philippians 4:6–7', text: 'Synthetic passage placeholder referencing prayerful gratitude and the guarding peace of God.' },
    { book: 'Luke', reference: 'Luke 10:38–42', text: 'Synthetic passage placeholder referencing attentive listening at the feet of Jesus amid daily tasks.' }
  ];

  function buildMonthChallenges(yearMonth, theme, titleBank) {
    var parts = yearMonth.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var totalDays = daysInMonth(year, month);
    var list = [];

    for (var day = 1; day <= totalDays; day++) {
      var isoDate = yearMonth + '-' + pad2(day);
      var title = titleBank[(day - 1) % titleBank.length];
      if (day > titleBank.length) {
        title = title + ' (Part ' + Math.ceil(day / titleBank.length) + ')';
      }
      var passage = SYNTHETIC_PASSAGES[(day + month) % SYNTHETIC_PASSAGES.length];
      var id = 'cms:ch-' + isoDate;

      list.push({
        id: id,
        yearMonth: yearMonth,
        date: isoDate,
        dayNumber: day,
        weekday: dayOfWeekUtc(isoDate),
        title: title,
        monthTheme: theme,
        estimatedRead: '4 min read',
        screens: [
          {
            id: 's1',
            heading: 'Opening Reading',
            body: [
              'Synthetic teaching screen 1 of 3 for "' + title + '" (' + formatCivilDate(isoDate) + '). In the production reader, this space presents Alexis Waid’s authored daily teaching for the "' + theme + '" publication month.',
              'Notice that global navigation is intentionally hidden during focused reading so you can stay unhurried, exit seamlessly at any point, or continue forward without timers or interruptions.'
            ],
            scripture: {
              id: 'scr-' + isoDate + '-1',
              book: passage.book,
              reference: passage.reference,
              text: passage.text,
              sourceLabel: formatYearMonth(yearMonth) + ' • ' + title
            }
          },
          {
            id: 's2',
            heading: 'Listening in Context',
            body: [
              'Synthetic teaching screen 2 of 3. Your reading position saves automatically on every screen transition — if you tap Exit now and return later, the reader resumes right here without a routine prompt.',
              'Use the visible Previous and Next controls below, or try optional horizontal swipe on touch devices. Swiping never forces completion.'
            ],
            optionalStudy: {
              label: 'Optional deeper study note',
              content: 'Optional reflection and deeper study blocks remain genuinely optional. Opening or skipping them never blocks explicit Finish.'
            }
          },
          {
            id: 's3',
            heading: 'Closing Reflection',
            body: [
              'Synthetic teaching screen 3 of 3. Reaching this final screen still leaves the Challenge unfinished until you intentionally select Finish below.',
              'Tapping Finish records completion once (idempotently), evaluates any qualifying Monthly Discoveries silently in the background, and returns you to the screen you came from.'
            ],
            optionalStudy: {
              label: 'Optional closing prayer prompt',
              content: 'Synthetic closing prayer placeholder: Pause in quiet gratitude for Scripture’s steady faithfulness today.'
            }
          }
        ]
      });
    }
    return list;
  }

  /* --------------------------------------------------------------------------
   * Title Banks (Clearly Synthetic Prototype Titles)
   * -------------------------------------------------------------------------- */
  var NOV_2026_TITLES = [
    'Opening the Door to Quiet Attention',
    'When Ordinary Meals Become Sanctuary',
    'Listening Before Answering in Haste',
    'Bread Broken at an Unexpected Table',
    'Small Faithfulness in Unseen Hours',
    'Praying Honestly When Words Run Thin',
    'Sabbath Pause for Weary Minds',
    'Making Room for the Neighbor Beside You',
    'Lament as a Pathway Back to Trust',
    'Holding Open Hands with Daily Provision',
    'A Song Learned in the Shadowed Valley',
    'Remembering Mercy in Midweek Fatigue',
    'The Kindness of Unhurried Presence',
    'Restoring Speech That Builds Up',
    'Gathering Around the Spoken Word',
    'Strength Quietly Renewed in Waiting',
    'Practicing Gentle Courage at Home',
    'A Welcome Table in the Middle of the Week',
    'Hearing Promise Through Familiar Psalms',
    'Laying Down Tomorrow’s Borrowed Worry',
    'Gratitude That Notices Small Graces',
    'Singing Trust When the Road Feels Steep',
    'Hospitality Without Perfectionism',
    'Returning to Stillness After Noise',
    'Mercy Shown in Patient Listening',
    'Thankfulness Anchored in Steadfast Love',
    'Carrying Peace Into Ordinary Errands',
    'Looking Ahead While Living Present',
    'Blessing the Work of Humble Hands',
    'Completing the Month with Quiet Hope'
  ];

  var DEC_2026_TITLES = [
    'Watchful Expectation at the Turning of the Year',
    'Light Promised Before Dawn Appears',
    'Prophets Who Kept Singing in Exile',
    'Preparing Room in Crowded Days',
    'A Quiet Genealogy of Grace',
    'Hope That Does Not Hurry',
    'Voices in the Wilderness',
    'Mary’s Song of Humble Rejoicing',
    'Courage in an Unexpected Calling',
    'The Nearness of Emmanuel',
    'Peace Announced to Night Watchers',
    'Wonder Kept and Treasured in the Heart',
    'Journeying by Borrowed Starlight',
    'Gifts Laid Before the Child',
    'Patience in the Long Silence',
    'Consolation Awaited in the Temple',
    'Simeon’s Song of Peace',
    'Anna’s Steadfast Witness',
    'Light Shining in the Shadow',
    'Grace Upon Grace Received',
    'Dwelling Among Us in Truth',
    'Joy That Outlasts Passing Seasons',
    'Quiet Eve of Promise Fulfilled',
    'The Word Made Flesh',
    'Good News of Great Joy',
    'Carrying Christmas Peace Into Ordinary Days',
    'Remembering Every Faithful Step',
    'Steadfast Mercy Through Changing Years',
    'Blessing the Threshold Ahead',
    'Entrusting Tomorrow to Faithful Hands',
    'Closing the Year in Gratitude'
  ];

  var MAR_2026_TITLES = [
    'Planting Patience in Early Soil',
    'Hidden Roots Beneath Winter Ground',
    'Watering Small Habits of Prayer',
    'Trusting Growth We Cannot Yet Measure',
    'Clearing Thorns of Distraction',
    'Standing Firm in Sudden Wind',
    'First Shoots of Quiet Joy',
    'Tending the Heart with Gentle Truth',
    'Waiting Through Slow Seasons',
    'Fruit Born from Abiding',
    'Pruning Without Fear',
    'Sunlight After Long Clouds',
    'Sharing Harvest Before Abundance',
    'Steadfastness Learned Day by Day',
    'Keeping Watch Over Our Words',
    'Mercy That Makes All Things New',
    'Walking Together Along the Row',
    'Gratitude for Unseen Rain',
    'Rest as Part of the Harvest',
    'Anchored in Living Hope',
    'Faith That Endures Ordinary Storms',
    'A Field Ready for Kindness',
    'Listening for the Shepherd’s Voice',
    'Courage for Quiet Obedience',
    'Peace Planted in Peacemakers',
    'Strength Shared with the Weary',
    'Remembering Former Faithfulness',
    'Looking Upward in Every Season',
    'Steadfast Love That Never Fails',
    'Rejoicing in Patient Endurance',
    'Closing March in Renewed Trust'
  ];

  var OCT_2026_TITLES = [
    'Greeting One Another in Grace',
    'Thankfulness for Distant Friends',
    'Praying with Confidence for Others',
    'Standing Together in One Spirit',
    'Humility Shaped by the Cross',
    'Shining Gently in a Restless World',
    'Counting Every Gain Beside Knowing Christ',
    'Pressing On Without Pretense',
    'Rejoicing Always in Measured Steps',
    'Thinking on Whatever Is Lovely',
    'Contentment Learned in Every Season',
    'Carrying One Another’s Burdens',
    'Words Seasoned with Grace',
    'Encouraging the Fainthearted',
    'Holding Fast to What Is Good',
    'Patience Toward Every Neighbor',
    'Remembering Teachers of the Faith',
    'Steadfast Love Across Miles',
    'Generosity Born from Gratitude',
    'Courage When Ministry Feels Small',
    'Guarding the Peace of the Church',
    'Walking Worthy of the Calling',
    'Speaking Truth in Tender Love',
    'Forgiving as We Have Been Forgiven',
    'Singing Psalms to One Another',
    'Praying Without Ceasing',
    'Standing Watch in Sober Hope',
    'Comforting One Another with Promise',
    'A Final Word of Benediction',
    'Grace Be With Your Spirit',
    'Closing October in Encouragement'
  ];

  var SEP_2026_TITLES = [
    'The Beginning of Reverent Wisdom',
    'Listening Well to Counsel',
    'Paths Marked by Integrity',
    'Gentle Answers That Calm Anger',
    'Guarding the Wellspring of the Heart',
    'Diligence Without Anxiety',
    'True Friendship in Adversity',
    'Humility Before Honor',
    'Honest Scales in Small Matters',
    'Patience Stronger Than Force',
    'Words Like Apples of Gold',
    'Wisdom Calling in the Everyday Square',
    'Receiving Correction with Grace',
    'Generosity That Refreshes Others',
    'Trusting Beyond Our Own Sight',
    'The Shelter of a Steady Tongue',
    'Finding Joy in Simple Provision',
    'Remembering the Poor with Dignity',
    'Slow to Speak, Quick to Listen',
    'Planning Humbly Before the Lord',
    'Peaceful Homes Built on Wisdom',
    'Courage to Choose What Is Right',
    'Discernment in Noisy Hours',
    'Faithful Wounds of a Friend',
    'Quiet Confidence in God’s Care',
    'Steadfastness Under Testing',
    'Wisdom From Above Is Peaceable',
    'Sowing Righteousness in Peace',
    'Walking Carefully in the Light',
    'Closing September in Wisdom'
  ];

  var GENERIC_TITLES = [
    'Morning Mercy in Ordinary Hours',
    'Listening Carefully to the Text',
    'Steadfast Love Remembered',
    'Walking Humbly with God',
    'Quiet Strength for Today',
    'Grace at the Center of Life',
    'Sabbath Rest and Renewal',
    'Hope Anchored in Promise',
    'Kindness in Everyday Speech',
    'A Heart Attentive to Scripture',
    'Faithfulness in Small Things',
    'Peace Beyond Understanding'
  ];

  /* --------------------------------------------------------------------------
   * Scripture Cards Catalog (Synthetic Placeholders)
   * -------------------------------------------------------------------------- */
  var CARDS_BY_ID = {
    'card-2026-11-hospitality': {
      id: 'card-2026-11-hospitality',
      title: 'Everyday Hospitality (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-11',
      artMotif: 'vessel',
      altText: 'Synthetic notebook illustration showing a calm ceramic vessel representing everyday hospitality.',
      scriptureBook: 'Romans',
      scriptureReference: 'Romans 12:13',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Romans 12:13 on sharing with those in need and practicing unhurried hospitality.',
      explanation: 'Synthetic theological explanation: Across three November readings, hospitality appears not as polished performance but as ordinary attentiveness — making room at the table with open hands. (Placeholder editorial copy for R06 prototype review.)',
      theologicalThemes: ['Hospitality', 'Community', 'Mercy', 'Everyday Faith']
    },
    'card-2026-11-valley-prayers': {
      id: 'card-2026-11-valley-prayers',
      title: 'Prayers in the Valley (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-11',
      artMotif: 'lantern',
      altText: 'Synthetic notebook illustration showing a warm lantern glow symbolizing honest prayer in shadowed seasons.',
      scriptureBook: 'Psalms',
      scriptureReference: 'Psalm 23:4',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Psalm 23:4 on the Shepherd’s steady companionship in the valley.',
      explanation: 'Synthetic theological explanation: Honest lament and quiet petition weave through November’s valley readings, reminding readers that Scripture invites candor rather than polished pretense.',
      theologicalThemes: ['Prayer', 'Lament', 'Trust', 'Psalms']
    },
    'card-2026-11-songs-of-trust': {
      id: 'card-2026-11-songs-of-trust',
      title: 'Songs of Trust (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-11',
      artMotif: 'olive',
      altText: 'Synthetic notebook illustration showing an olive branch symbolizing steady trust.',
      scriptureBook: 'Isaiah',
      scriptureReference: 'Isaiah 26:3–4',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Isaiah 26:3–4 on steadfast peace for minds stayed on God.',
      explanation: 'Synthetic theological explanation: Songs of trust emerge not after every difficulty disappears, but while walking calmly with God through ordinary days.',
      theologicalThemes: ['Trust', 'Peace', 'Praise']
    },
    'card-2026-11-full': {
      id: 'card-2026-11-full',
      title: 'Paths of Quiet Faith — Full Month (Synthetic)',
      sourceCategory: 'monthlyFull',
      publicationYearMonth: '2026-11',
      artMotif: 'arch',
      altText: 'Synthetic notebook illustration showing a serene archway marking full-month completion for November 2026.',
      scriptureBook: 'Isaiah',
      scriptureReference: 'Isaiah 30:15',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Isaiah 30:15 on returning, rest, quietness, and trust.',
      explanation: 'Synthetic full-month Scripture Card explanation: Awarded upon finishing every Challenge in the finalized November 2026 publication month.',
      theologicalThemes: ['Quiet Faith', 'Endurance', 'Rest']
    },
    'card-2026-10-encouragement': {
      id: 'card-2026-10-encouragement',
      title: 'Letters of Encouragement (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-10',
      artMotif: 'scroll',
      altText: 'Synthetic notebook illustration showing a calm scroll symbolizing epistle encouragement.',
      scriptureBook: 'Philippians',
      scriptureReference: 'Philippians 1:3–6',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Philippians 1:3–6 on gratitude and perseverance in Christ.',
      explanation: 'Synthetic theological explanation: Apostolic letters model steady encouragement anchored in God’s faithfulness across distance.',
      theologicalThemes: ['Encouragement', 'Friendship', 'Perseverance']
    },
    'card-2026-10-peace': {
      id: 'card-2026-10-peace',
      title: 'Guarding Peace Together (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-10',
      artMotif: 'botanical',
      altText: 'Synthetic notebook illustration showing intertwined botanical leaves representing shared peace.',
      scriptureBook: 'Colossians',
      scriptureReference: 'Colossians 3:15',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Colossians 3:15 on letting the peace of Christ rule in your hearts.',
      explanation: 'Synthetic theological explanation: Biblical peace is practiced in community through forgiveness, patience, and shared thankfulness.',
      theologicalThemes: ['Peace', 'Community', 'Forgiveness']
    },
    'card-2026-10-full': {
      id: 'card-2026-10-full',
      title: 'Letters of Encouragement — Full Month (Synthetic)',
      sourceCategory: 'monthlyFull',
      publicationYearMonth: '2026-10',
      artMotif: 'arch',
      altText: 'Synthetic notebook illustration marking full-month completion for October 2026.',
      scriptureBook: '1 Thessalonians',
      scriptureReference: '1 Thessalonians 5:11',
      scriptureText: 'Synthetic Scripture Card text placeholder citing 1 Thessalonians 5:11 on building one another up.',
      explanation: 'Synthetic full-month Scripture Card explanation for completing all October 2026 Challenges.',
      theologicalThemes: ['Encouragement', 'Community']
    },
    'card-2026-09-wisdom': {
      id: 'card-2026-09-wisdom',
      title: 'Gentle Wisdom (Synthetic)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2026-09',
      artMotif: 'olive',
      altText: 'Synthetic notebook illustration representing gentle wisdom.',
      scriptureBook: 'James',
      scriptureReference: 'James 3:17',
      scriptureText: 'Synthetic Scripture Card text placeholder citing James 3:17 on wisdom that is pure, peaceable, and gentle.',
      explanation: 'Synthetic theological explanation: Wisdom in Scripture is measured by humility and peaceable fruit rather than sharp debate.',
      theologicalThemes: ['Wisdom', 'Humility', 'Peace']
    },
    'card-2026-09-full': {
      id: 'card-2026-09-full',
      title: 'Walking in Wisdom — Full Month (Synthetic)',
      sourceCategory: 'monthlyFull',
      publicationYearMonth: '2026-09',
      artMotif: 'arch',
      altText: 'Synthetic notebook illustration marking full-month completion for September 2026.',
      scriptureBook: 'Proverbs',
      scriptureReference: 'Proverbs 3:5–6',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Proverbs 3:5–6 on trusting the Lord with all your heart.',
      explanation: 'Synthetic full-month Scripture Card explanation for completing all September 2026 Challenges.',
      theologicalThemes: ['Wisdom', 'Trust']
    },
    'card-2025-11-gratitude': {
      id: 'card-2025-11-gratitude',
      title: 'Steadfast Gratitude (Synthetic — Broken Art Demo)',
      sourceCategory: 'monthlyThematic',
      publicationYearMonth: '2025-11',
      artMotif: 'lantern',
      simulateBrokenArt: true,
      altText: 'Synthetic notebook illustration for Steadfast Gratitude.',
      scriptureBook: 'Psalms',
      scriptureReference: 'Psalm 107:1',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Psalm 107:1 on giving thanks for steadfast love.',
      explanation: 'Synthetic theological explanation: Even when an image asset cannot load, the reader’s earned record, earned date, Scripture reference, and explanation remain truthfully preserved.',
      theologicalThemes: ['Gratitude', 'Psalms', 'Steadfast Love']
    },
    'card-foundation-patient-reading': {
      id: 'card-foundation-patient-reading',
      title: 'Reading Scripture Patiently (Synthetic Foundation)',
      sourceCategory: 'foundationsLearning',
      publicationYearMonth: null,
      artMotif: 'scroll',
      altText: 'Synthetic notebook illustration for Foundations & Learning card Reading Scripture Patiently.',
      scriptureBook: 'Psalms',
      scriptureReference: 'Psalm 119:105',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Psalm 119:105 on God’s word as a lamp to our feet.',
      explanation: 'Synthetic Foundations & Learning Card explanation: Earned by explicitly finishing an eligible Foundations teaching reading. Completely distinct from the skippable App Tutorial, which never awards Cards (G07).',
      theologicalThemes: ['Foundations', 'Scripture Reading', 'Patience']
    },
    'card-special-advent-2025-a': {
      id: 'card-special-advent-2025-a',
      title: 'Candle of Quiet Watch (Synthetic Event)',
      sourceCategory: 'specialExperience',
      publicationYearMonth: null,
      eventId: 'evt-advent-quiet-2025',
      eventTitle: 'Advent Quiet Week 2025 (Synthetic Event)',
      artMotif: 'gathering',
      altText: 'Synthetic notebook illustration for Advent Quiet Week 2025 Special Experience card.',
      scriptureBook: 'Luke',
      scriptureReference: 'Luke 1:78–79',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Luke 1:78–79 on tender mercy guiding our feet into the way of peace.',
      explanation: 'Synthetic Special Experience Card explanation: Permanently retained in Field Notebook under Special Experiences grouped by its originating event. Expired event activities are not reopened.',
      theologicalThemes: ['Advent', 'Hope', 'Peace']
    },
    'card-special-advent-2025-b': {
      id: 'card-special-advent-2025-b',
      title: 'Song of the Night Watch (Synthetic Event)',
      sourceCategory: 'specialExperience',
      publicationYearMonth: null,
      eventId: 'evt-advent-quiet-2025',
      eventTitle: 'Advent Quiet Week 2025 (Synthetic Event)',
      artMotif: 'lantern',
      altText: 'Synthetic notebook illustration for Song of the Night Watch Special Experience card.',
      scriptureBook: 'Psalms',
      scriptureReference: 'Psalm 130:5–6',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Psalm 130:5–6 on waiting for the Lord more than watchmen for the morning.',
      explanation: 'Synthetic Special Experience Card explanation: Second earned Card grouped under Advent Quiet Week 2025.',
      theologicalThemes: ['Advent', 'Waiting', 'Psalms']
    },
    'card-special-psalms-2026': {
      id: 'card-special-psalms-2026',
      title: 'Evening Psalms Gathering (Synthetic Event)',
      sourceCategory: 'specialExperience',
      publicationYearMonth: null,
      eventId: 'evt-spring-psalms-2026',
      eventTitle: 'Spring Psalms Night 2026 (Synthetic Event)',
      artMotif: 'botanical',
      altText: 'Synthetic notebook illustration for Spring Psalms Night 2026 Special Experience card.',
      scriptureBook: 'Psalms',
      scriptureReference: 'Psalm 141:2',
      scriptureText: 'Synthetic Scripture Card text placeholder citing Psalm 141:2 on evening prayer rising before God.',
      explanation: 'Synthetic Special Experience Card explanation: Earned during the synthetic Spring Psalms Night 2026 gathering and permanently retained in Field Notebook.',
      theologicalThemes: ['Psalms', 'Prayer', 'Community']
    }
  };

  /* --------------------------------------------------------------------------
   * Publication Months Catalog (2024–2026)
   * -------------------------------------------------------------------------- */
  function makeMonth(config) {
    var challenges = buildMonthChallenges(config.yearMonth, config.theme, config.titles || GENERIC_TITLES);
    return {
      yearMonth: config.yearMonth,
      year: Number(config.yearMonth.slice(0, 4)),
      month: Number(config.yearMonth.slice(5, 7)),
      heading: formatYearMonth(config.yearMonth),
      theme: config.theme,
      summary: config.summary,
      finalized: true,
      introScreens: [
        {
          eyebrow: formatYearMonth(config.yearMonth) + ' • Monthly Introduction',
          title: config.theme,
          body: config.summary + ' (Synthetic Monthly Introduction screen 1 of 3 — separate from the general App Introduction and App Tutorial.)'
        },
        {
          eyebrow: 'How This Month Unfolds',
          title: 'Daily Readings at Your Own Pace',
          body: 'Each day releases on its scheduled reader-local date. Future titles are visible from the start, while manuscripts and Monthly Discoveries unfold faithfully without rush or streaks.'
        },
        {
          eyebrow: 'Monthly Welcome',
          title: 'Welcome to ' + config.theme,
          isWelcome: true,
          body: 'You are entering ' + formatYearMonth(config.yearMonth) + '. You can revisit this Monthly Introduction anytime from the Month Screen header.'
        }
      ],
      challenges: challenges,
      weeks: buildMondaySundayWeeks(config.yearMonth, challenges),
      discoveries: config.discoveries || [],
      fullMonthDiscovery: config.fullMonthDiscovery || null
    };
  }

  var MONTHS_LIST = [
    makeMonth({
      yearMonth: '2026-12',
      theme: 'Waiting in Hope (Synthetic)',
      summary: 'A quiet December journey tracing promise, watchful hope, and peace through Advent and year’s end.',
      titles: DEC_2026_TITLES,
      discoveries: [
        {
          id: 'disc-2026-12-watchful',
          title: 'Watchful Promise',
          cardId: 'card-2026-11-songs-of-trust', // Reused synthetic placeholder if Dec 1 rollover completed
          qualifyingChallengeIds: ['cms:ch-2026-12-01', 'cms:ch-2026-12-02']
        }
      ],
      fullMonthDiscovery: {
        id: 'disc-2026-12-full',
        title: 'Complete December 2026',
        cardId: 'card-2026-11-full'
      }
    }),
    makeMonth({
      yearMonth: '2026-11',
      theme: 'Paths of Quiet Faith (Synthetic)',
      summary: 'November explores steady trust, honest prayer in shadowed valleys, and unhurried everyday hospitality.',
      titles: NOV_2026_TITLES,
      discoveries: [
        {
          id: 'disc-2026-11-hospitality',
          title: 'Everyday Hospitality',
          cardId: 'card-2026-11-hospitality',
          // Internal server-side mapping only — NEVER exposed to reader UI!
          qualifyingChallengeIds: ['cms:ch-2026-11-04', 'cms:ch-2026-11-08', 'cms:ch-2026-11-18']
        },
        {
          id: 'disc-2026-11-valley',
          title: 'Prayers in the Valley',
          cardId: 'card-2026-11-valley-prayers',
          qualifyingChallengeIds: ['cms:ch-2026-11-06', 'cms:ch-2026-11-09', 'cms:ch-2026-11-11']
        },
        {
          id: 'disc-2026-11-trust',
          title: 'Songs of Trust',
          cardId: 'card-2026-11-songs-of-trust',
          qualifyingChallengeIds: ['cms:ch-2026-11-16', 'cms:ch-2026-11-17']
        }
      ],
      fullMonthDiscovery: {
        id: 'disc-2026-11-full',
        title: 'Complete November 2026',
        cardId: 'card-2026-11-full'
      }
    }),
    makeMonth({
      yearMonth: '2026-10',
      theme: 'Letters of Encouragement (Synthetic)',
      summary: 'A month listening to the pastoral warmth, gratitude, and shared peace of the New Testament epistles.',
      titles: OCT_2026_TITLES,
      discoveries: [
        {
          id: 'disc-2026-10-encouragement',
          title: 'Letters of Encouragement',
          cardId: 'card-2026-10-encouragement',
          qualifyingChallengeIds: ['cms:ch-2026-10-01', 'cms:ch-2026-10-02', 'cms:ch-2026-10-03']
        },
        {
          id: 'disc-2026-10-peace',
          title: 'Guarding Peace Together',
          cardId: 'card-2026-10-peace',
          qualifyingChallengeIds: ['cms:ch-2026-10-04', 'cms:ch-2026-10-05']
        }
      ],
      fullMonthDiscovery: {
        id: 'disc-2026-10-full',
        title: 'Complete October 2026',
        cardId: 'card-2026-10-full'
      }
    }),
    makeMonth({
      yearMonth: '2026-09',
      theme: 'Walking in Wisdom (Synthetic)',
      summary: 'Everyday discernment, gentle speech, and wholehearted trust across Proverbs and James.',
      titles: SEP_2026_TITLES,
      discoveries: [
        {
          id: 'disc-2026-09-wisdom',
          title: 'Gentle Wisdom',
          cardId: 'card-2026-09-wisdom',
          qualifyingChallengeIds: ['cms:ch-2026-09-01', 'cms:ch-2026-09-04', 'cms:ch-2026-09-10']
        }
      ],
      fullMonthDiscovery: {
        id: 'disc-2026-09-full',
        title: 'Complete September 2026',
        cardId: 'card-2026-09-full'
      }
    }),
    makeMonth({
      yearMonth: '2026-08',
      theme: 'Mercy in the Ordinary (Synthetic)',
      summary: 'Noticing God’s steady mercy inside unremarkable Tuesday responsibilities and quiet service.'
    }),
    makeMonth({
      yearMonth: '2026-07',
      theme: 'Psalms for Restless Hours (Synthetic)',
      summary: 'Praying the Psalter’s honesty when midsummer days feel stretched thin.'
    }),
    makeMonth({
      yearMonth: '2026-06',
      theme: 'Covenant & Promise (Synthetic)',
      summary: 'Tracing God’s faithful covenant promises from Genesis through the Gospels.'
    }),
    makeMonth({
      yearMonth: '2026-05',
      theme: 'Parables of the Kingdom (Synthetic)',
      summary: 'Unhurried stories of mustard seeds, lost sheep, and surprising grace.'
    }),
    makeMonth({
      yearMonth: '2026-04',
      theme: 'Witnesses of Renewal (Synthetic)',
      summary: 'Resurrection encounters that turn fear into patient witness.'
    }),
    makeMonth({
      yearMonth: '2026-03',
      theme: 'Seeds of Steadfastness (Synthetic)',
      summary: 'Early-spring reflections on hidden roots, patient habits, and endurance.',
      titles: MAR_2026_TITLES
    }),
    makeMonth({
      yearMonth: '2026-02',
      theme: 'Rooted in Love (Synthetic)',
      summary: 'Short February meditations on steadfast love and humble neighborhood care.'
    }),
    makeMonth({
      yearMonth: '2026-01',
      theme: 'Beginnings in Grace (Synthetic)',
      summary: 'Opening the year with calm rhythms of listening and prayer.'
    }),
    makeMonth({
      yearMonth: '2025-12',
      theme: 'Light in the Quiet Night (Synthetic)',
      summary: 'Historical December 2025 publication month.'
    }),
    makeMonth({
      yearMonth: '2025-11',
      theme: 'Tables of Thanksgiving (Synthetic)',
      summary: 'Historical November 2025 publication month.',
      discoveries: [
        {
          id: 'disc-2025-11-gratitude',
          title: 'Steadfast Gratitude',
          cardId: 'card-2025-11-gratitude',
          qualifyingChallengeIds: ['cms:ch-2025-11-01', 'cms:ch-2025-11-02']
        }
      ]
    }),
    makeMonth({
      yearMonth: '2025-10',
      theme: 'Shepherd & Flock (Synthetic)',
      summary: 'Historical October 2025 publication month.'
    }),
    makeMonth({
      yearMonth: '2025-09',
      theme: 'Praying the Gospels (Synthetic)',
      summary: 'Historical September 2025 publication month.'
    }),
    makeMonth({
      yearMonth: '2025-06',
      theme: 'Summer of Still Waters (Synthetic)',
      summary: 'Historical June 2025 publication month.'
    }),
    makeMonth({
      yearMonth: '2025-03',
      theme: 'Questions Jesus Asked (Synthetic)',
      summary: 'Historical March 2025 publication month.'
    }),
    makeMonth({
      yearMonth: '2024-11',
      theme: 'First Harvest of Gratitude (Synthetic)',
      summary: 'Historical November 2024 publication month.'
    }),
    makeMonth({
      yearMonth: '2024-08',
      theme: 'Foundational Psalms (Synthetic)',
      summary: 'Historical August 2024 publication month.'
    })
  ];

  var MONTHS_BY_ID = {};
  var CHALLENGES_BY_ID = {};
  MONTHS_LIST.forEach(function (m) {
    MONTHS_BY_ID[m.yearMonth] = m;
    m.challenges.forEach(function (ch) {
      CHALLENGES_BY_ID[ch.id] = ch;
    });
  });

  /* --------------------------------------------------------------------------
   * Foundations Readings (Optional; #1 is synthetic award-eligible teaching for G07)
   * -------------------------------------------------------------------------- */
  var FOUNDATIONS = [
    {
      id: 'cms:fnd-patient-reading',
      title: 'How to Read Scripture Patiently (Synthetic)',
      subtitle: 'Optional foundational reading • Eligible for a Foundations & Learning Card on Finish',
      awardEligibleCardId: 'card-foundation-patient-reading',
      estimatedRead: '5 min read',
      available: true,
      screens: [
        {
          id: 'fs1',
          heading: 'Unhurried Attention',
          body: [
            'Synthetic Foundations reading (Screen 1 of 3). Foundations is optional and non-punitive — you can begin anytime, pause with automatic resume, or return later without penalty.',
            'This synthetic reading represents separately authored, award-eligible ministry teaching (G07), distinct from the skippable Guided App Tutorial which never awards Cards.'
          ],
          scripture: {
            id: 'scr-fnd-1',
            book: 'Psalms',
            reference: 'Psalm 119:105',
            text: 'Synthetic passage placeholder referencing God’s word illuminating the next faithful step.',
            sourceLabel: 'Foundations • How to Read Scripture Patiently'
          }
        },
        {
          id: 'fs2',
          heading: 'Reading in Context',
          body: [
            'Synthetic Foundations reading (Screen 2 of 3). Exiting here preserves your saved reading position so Library → Foundations offers a conditional Resume Reading primary action.'
          ]
        },
        {
          id: 'fs3',
          heading: 'Carrying Scripture Into the Day',
          body: [
            'Synthetic Foundations reading (Screen 3 of 3). Selecting explicit Finish below completes this teaching and awards the permanent Foundations & Learning Scripture Card (announced on Today).'
          ]
        }
      ]
    },
    {
      id: 'cms:fnd-context-genre',
      title: 'Understanding Context & Genre (Synthetic)',
      subtitle: 'Optional foundational reading • Poetry, narrative, and letters',
      awardEligibleCardId: null,
      estimatedRead: '4 min read',
      available: true,
      screens: [
        {
          id: 'cg1',
          heading: 'Recognizing Literary Shape',
          body: ['Synthetic Foundations reading (Screen 1 of 2) explaining how reading a psalm differs from reading a pastoral letter.']
        },
        {
          id: 'cg2',
          heading: 'Listening for the Whole Story',
          body: ['Synthetic Foundations reading (Screen 2 of 2). Explicit Finish records completion without requiring streaks or sequential lock-in.']
        }
      ]
    },
    {
      id: 'cms:fnd-praying-psalms',
      title: 'Praying Through the Psalms (Synthetic)',
      subtitle: 'Optional foundational guide • Honest prayer in every season',
      awardEligibleCardId: null,
      estimatedRead: '4 min read',
      available: true,
      screens: [
        {
          id: 'pp1',
          heading: 'A Language for Every Season',
          body: ['Synthetic Foundations reading (Screen 1 of 2) introducing thanksgiving, trust, and lament psalms.']
        },
        {
          id: 'pp2',
          heading: 'Making a Psalm Your Own',
          body: ['Synthetic Foundations reading (Screen 2 of 2).']
        }
      ]
    },
    {
      id: 'cms:fnd-unavailable-demo',
      title: 'Archived Study Companion (Unavailable Demo)',
      subtitle: 'Demonstrates safe unavailable fallback when a saved reading is withdrawn',
      awardEligibleCardId: null,
      estimatedRead: 'Unavailable',
      available: false,
      screens: []
    }
  ];

  var FOUNDATIONS_BY_ID = {};
  FOUNDATIONS.forEach(function (f) { FOUNDATIONS_BY_ID[f.id] = f; });

  /* --------------------------------------------------------------------------
   * Ministry News Articles (Matches src/components/news/newsModel.ts taxonomy)
   * -------------------------------------------------------------------------- */
  var NEWS_ARTICLES = [
    {
      id: 'news-dec-preview',
      category: 'monthlyPreview',
      categoryLabel: 'Monthly Preview',
      publishedOn: '2026-11-20',
      title: 'Looking Ahead to December: Waiting in Hope (Synthetic)',
      summary: 'An editorial note on our upcoming December teaching theme, releasing in advance preview on November 28.',
      body: [
        'Synthetic Ministry News article (Monthly Preview). Ministry News is strictly editorial — it never mixes in personal earned Scripture Card notifications or fabricated unread badges.',
        'On November 28, readers will be able to preview December’s theme, introduction screens, and upcoming Challenge titles while keeping unreleased manuscripts and Monthly Discoveries safely withheld until December 1.'
      ],
      authorizedMonthLink: {
        href: '#/month/2026-12',
        yearMonth: '2026-12',
        label: 'Open December 2026 Preview'
      }
    },
    {
      id: 'news-nov-letter',
      category: 'ministryUpdate',
      categoryLabel: 'Ministry Update',
      publishedOn: '2026-11-12',
      title: 'A Mid-Autumn Note from the Bibleberry Editorial Desk (Synthetic)',
      summary: 'Reflections on pacing, seasonal quietness, and how monthly themes grow from Scripture first.',
      body: [
        'Synthetic Ministry Update article. Every Bibleberry month begins with substantive Christian teaching rather than gamified quotas or daily streak pressure.',
        'Thank you for reading alongside this community at whatever rhythm fits your season of life.'
      ]
    },
    {
      id: 'news-audio-companion',
      category: 'announcement',
      categoryLabel: 'Announcement',
      publishedOn: '2026-11-03',
      title: 'Winter Podcast Notes & Companion Resources (Synthetic)',
      summary: 'Where to find optional audio conversations and seasonal reading companions under More.',
      body: [
        'Synthetic Announcement article. Optional podcasts and editorial resources live calmly inside More → Podcasts & Resources without cluttering your daily teaching space.'
      ]
    },
    {
      id: 'news-oct-recap',
      category: 'ministryUpdate',
      categoryLabel: 'Ministry Update',
      publishedOn: '2026-10-25',
      title: 'How Historical Months Stay Permanently Available (Synthetic)',
      summary: 'Every ordinary publication month moves into Library automatically so you never lose access when the calendar turns.',
      body: [
        'Synthetic Ministry Update article. Whether you keep up to three past months on your Shelf or browse all years in Library → Browse All Months, historical teaching remains open with full credit.'
      ],
      authorizedMonthLink: {
        href: '#/month/2026-10',
        yearMonth: '2026-10',
        label: 'Visit October 2026 Month Screen'
      }
    }
  ];

  /* --------------------------------------------------------------------------
   * External Deep-Link Fixtures (G04-A & G04-B)
   * -------------------------------------------------------------------------- */
  var EXTERNAL_LINKS = {
    'ext-today-released': {
      id: 'ext-today-released',
      label: 'Authorized Today Challenge (Nov 18)',
      status: 'released',
      challengeId: 'cms:ch-2026-11-18',
      sourceNote: 'Shared from YouTube teaching description (Synthetic)'
    },
    'ext-oct-released': {
      id: 'ext-oct-released',
      label: 'Authorized Historical Challenge (Oct 14)',
      status: 'released',
      challengeId: 'cms:ch-2026-10-14',
      sourceNote: 'Shared historical link — G04-A verifies Exit/Finish returns to Today, not October Month Screen'
    },
    'ext-embargoed': {
      id: 'ext-embargoed',
      label: 'Embargoed Future Challenge (Nov 25)',
      status: 'embargoed',
      challengeId: 'cms:ch-2026-11-25',
      sourceNote: 'Must fail closed neutrally without revealing future copy or release hints'
    },
    'ext-withdrawn': {
      id: 'ext-withdrawn',
      label: 'Withdrawn Challenge Link',
      status: 'withdrawn',
      challengeId: 'cms:ch-withdrawn-demo',
      sourceNote: 'Must fail closed neutrally with Return to Today'
    },
    'ext-invalid': {
      id: 'ext-invalid',
      label: 'Invalid / Malformed Link',
      status: 'invalid',
      challengeId: 'cms:unknown-999',
      sourceNote: 'Must fail closed neutrally with Return to Today'
    }
  };

  /* --------------------------------------------------------------------------
   * Helper: Build complete-month IDs for September 2026 (30 days)
   * -------------------------------------------------------------------------- */
  function allChallengeIdsForMonth(yearMonth) {
    var m = MONTHS_BY_ID[yearMonth];
    return m ? m.challenges.map(function (c) { return c.id; }) : [];
  }

  /* --------------------------------------------------------------------------
   * Base State Factory & G09 Scenario Presets
   * -------------------------------------------------------------------------- */
  function createBaseState() {
    return {
      scenarioId: 'g09-6-earned-collections',
      simulatedDate: '2026-11-18',
      todayChallengeUnavailable: false,
      activeTab: 'today',
      // Per-tab nested route stack & scroll preservation (§2.3)
      tabViews: {
        today: { view: 'today-landing' },
        library: { view: 'library-landing' },
        collections: { view: 'collections-landing' },
        more: { view: 'more-landing' }
      },
      tabScroll: { today: 0, library: 0, collections: 0, more: 0 },
      monthScroll: {},

      // Active focused overlays / full-screen modes
      activeOverlay: null, // 'app-intro' | 'challenge' | 'month-intro' | 'external-unavailable' | null
      activeChallengeSession: null, // { challengeId, isFoundation, screenIndex, origin, originTab, originMeta, isReread }
      activeMonthIntro: null, // { yearMonth, screenIndex, isPreview, returnTab, returnView }
      activeExternalError: null, // { reasonCode }

      // Independent onboarding flags (G06, G04-B)
      onboarding: {
        introStatus: 'completed', // 'pending' | 'completed' | 'skipped'
        tutorialStatus: 'completed', // 'pending' | 'completed' | 'skipped'
        introReplayMode: false,
        introStep: 0,
        reminderEnabled: false,
        reminderTime: '08:00',
        tutorialActive: false,
        tutorialStep: 0,
        tutorialReplayMode: false
      },

      // Monthly Introduction & Preview flags (G05)
      seenMonthIntros: {}, // { '2026-11': true }
      seenMonthPreviews: {}, // { '2026-12': true }

      // Participation & Reading Progress (Durable synthetic records)
      completedChallengeIds: [], // canonical IDs
      savedPositions: {}, // { 'cms:ch-...': { screenIndex: 1, updatedOn: '2026-11-17' } }
      foundationPositions: {}, // { 'cms:fnd-...': { screenIndex: 1, updatedOn: '2026-11-16' } }

      // Earned Scripture Cards (authoritative earned-only map)
      earnedAwards: {}, // { cardId: { cardId, earnedOn, cardViewed, hubAnnouncementAcked } }
      newDiscoveriesIndicator: false,
      announcementsEnabled: true,

      // Saved Scripture (independent app-wide collection)
      savedScriptures: [], // [{ id, book, reference, text, sourceLabel, savedOn }]

      // Shelf & Active Historical Focus (0–3 historical months)
      shelf: {
        months: [], // [{ yearMonth, admissionKind: 'readerSelected'|'autoAdmitted', protected: bool, admittedOn: 'YYYY-MM-DD' }]
        activeFocusMonth: null // 'YYYY-MM' | null
      },

      // G02 One-time post-rollover interrupted prior-month continuation
      rolloverInterruption: {
        eligible: false,
        consumed: false,
        priorYearMonth: null,
        challengeId: null
      },

      // Library Browse All Months UI state
      libraryUi: {
        expandedYears: { '2026': true, '2025': false, '2024': false },
        searchQuery: '',
        visibleCount: 8,
        loadState: 'ready' // 'ready' | 'loading' | 'error' | 'empty'
      },

      // Field Notebook & Saved Scripture UI state
      notebookUi: {
        selectedYear: 2026,
        searchQuery: ''
      },
      savedScriptureUi: {
        mode: 'recent', // 'recent' | 'book'
        selectedBook: null,
        searchQuery: ''
      },

      // Ministry News UI & reviewer-simulated load states
      newsUi: {
        category: 'all',
        loadState: 'ready' // 'ready' | 'loading' | 'empty' | 'error'
      },

      // Appearance Preferences (§8.3)
      appearance: {
        paletteMode: 'seasons', // 'seasons' | 'manual'
        manualPalette: 'palette-linen',
        contrastMode: 'light', // 'light' | 'dark' | 'system'
        textScale: 'default', // 'default' | 'large' | 'xlarge'
        reducedMotion: false
      },

      // Guest Account Invitation & Simulated Account Merge (G08)
      account: {
        signedIn: false,
        email: null,
        guestInviteDismissed: false,
        mergeStatus: 'idle', // 'idle' | 'authenticating' | 'reconciling' | 'verifiedSuccess' | 'failed'
        mergeScenario: 'existing-conflict', // 'new-account' | 'existing-clean' | 'existing-conflict' | 'partial-failure'
        lastMergeSummary: null, // { mode, preservedCategories, hadShelfConflict, accountShelfLabel, dismissed }
        mergeConfirmationShown: false,
        simulatedExistingAccount: {
          email: 'reader@example.org',
          completedChallengeIds: ['cms:ch-2026-10-01', 'cms:ch-2026-10-02', 'cms:ch-2026-10-03'],
          earnedAwards: {
            'card-2026-10-encouragement': {
              cardId: 'card-2026-10-encouragement',
              earnedOn: '2026-10-04',
              cardViewed: true,
              hubAnnouncementAcked: true
            }
          },
          savedScriptures: [
            {
              id: 'scr-acct-1',
              book: 'Psalms',
              reference: 'Psalm 121:1–2',
              text: 'Synthetic existing-account saved passage placeholder referencing help from the Maker of heaven and earth.',
              sourceLabel: 'Existing Account Record (Synthetic)',
              savedOn: '2026-10-02'
            }
          ],
          shelf: {
            months: [
              { yearMonth: '2026-08', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-09-05' },
              { yearMonth: '2026-07', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-08-12' }
            ],
            activeFocusMonth: '2026-08'
          }
        }
      },

      // Active modal dialogs (Shelf 4th-month replacement, Put Away Active Focus, Share Preview, Account Sign-In)
      modal: null,
      // Ephemeral polite announcement message
      statusMessage: ''
    };
  }

  var SCENARIOS = [
    {
      id: 'g09-1-normal-first-use',
      group: 'G09',
      shortLabel: '1. Normal First Use',
      description: 'Fresh guest launch: 3-screen App Introduction → skippable 4-destination Guided App Tutorial → Today → Challenge Exit/Resume/Start from Beginning/Finish.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-1-normal-first-use';
        s.onboarding.introStatus = 'pending';
        s.onboarding.tutorialStatus = 'pending';
        s.activeOverlay = 'app-intro';
        s.onboarding.introStep = 0;
        return s;
      }
    },
    {
      id: 'g09-2-external-first-use',
      group: 'G09',
      shortLabel: '2. External First Use',
      description: 'First-time guest arriving via an authorized external Challenge link BEFORE App Introduction, Tutorial, or Monthly Intro (G04-A & G04-B). Exit/Finish returns to Today with onboarding kept pending.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-2-external-first-use';
        s.onboarding.introStatus = 'pending';
        s.onboarding.tutorialStatus = 'pending';
        s.activeOverlay = 'challenge';
        s.activeChallengeSession = {
          challengeId: 'cms:ch-2026-10-14',
          isFoundation: false,
          screenIndex: 0,
          origin: 'external',
          originTab: 'today',
          originMeta: { externalLabel: EXTERNAL_LINKS['ext-oct-released'].sourceNote },
          isReread: false
        };
        return s;
      }
    },
    {
      id: 'g09-3-current-month',
      group: 'G09',
      shortLabel: '3. Current Month & Preview',
      description: 'First intentional November Month Screen visit opens Monthly Intro + Welcome (G05), while direct Today Challenge skips it. Use Workbench date controls for Nov 28 & Feb 27 preview.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-3-current-month';
        s.completedChallengeIds = ['cms:ch-2026-11-04', 'cms:ch-2026-11-08', 'cms:ch-2026-11-16'];
        s.savedPositions = {
          'cms:ch-2026-11-17': { screenIndex: 1, updatedOn: '2026-11-17' }
        };
        s.seenMonthIntros = {}; // First intentional Month Screen visit will trigger Monthly Intro!
        return s;
      }
    },
    {
      id: 'g09-4-historical-continuity',
      group: 'G09',
      shortLabel: '4. Historical Continuity',
      description: 'Explicit Active Focus (October 2026) with an unfinished saved Challenge for direct Continue Your Study resume. Switch Shelf focus to September (completed) for Review This Month (G01), or use Rollover triggers (G02/G03).',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-4-historical-continuity';
        var sepAll = allChallengeIdsForMonth('2026-09');
        s.completedChallengeIds = sepAll.concat([
          'cms:ch-2026-10-01', 'cms:ch-2026-10-02', 'cms:ch-2026-11-04'
        ]);
        s.savedPositions = {
          'cms:ch-2026-10-03': { screenIndex: 1, updatedOn: '2026-11-15' }
        };
        s.earnedAwards = {
          'card-2026-09-wisdom': { cardId: 'card-2026-09-wisdom', earnedOn: '2026-09-12', cardViewed: true, hubAnnouncementAcked: true },
          'card-2026-09-full': { cardId: 'card-2026-09-full', earnedOn: '2026-09-30', cardViewed: true, hubAnnouncementAcked: true }
        };
        s.seenMonthIntros = { '2026-11': true, '2026-10': true, '2026-09': true };
        s.shelf = {
          months: [
            { yearMonth: '2026-10', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-11-01' },
            { yearMonth: '2026-09', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-10-01' },
            { yearMonth: '2026-08', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-09-01' }
          ],
          activeFocusMonth: '2026-10'
        };
        return s;
      }
    },
    {
      id: 'g09-5-library-shelf',
      group: 'G09',
      shortLabel: '5. Library & Shelf',
      description: 'Full 3-slot Shelf (with Active Focus, Kept on Shelf, and unprotected auto-admitted card) ready to test 4th-month replacement, Put Away Active Focus reassign, Browse All Months search/pagination, and Foundations Resume Reading.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-5-library-shelf';
        s.activeTab = 'library';
        s.completedChallengeIds = [
          'cms:ch-2026-10-01', 'cms:ch-2026-10-02', 'cms:ch-2026-10-04',
          'cms:ch-2026-09-01', 'cms:ch-2026-08-01'
        ];
        s.foundationPositions = {
          'cms:fnd-patient-reading': { screenIndex: 1, updatedOn: '2026-11-16' }
        };
        s.seenMonthIntros = { '2026-11': true, '2026-10': true, '2026-09': true, '2026-08': true };
        s.shelf = {
          months: [
            { yearMonth: '2026-10', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-11-01' },
            { yearMonth: '2026-09', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-10-02' },
            { yearMonth: '2026-08', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-09-01' }
          ],
          activeFocusMonth: '2026-09'
        };
        return s;
      }
    },
    {
      id: 'g09-6-earned-collections',
      group: 'G09',
      shortLabel: '6. Earned Collections',
      description: 'Rich partial participation with unread Hub announcement, earned Monthly + Foundations & Learning + Special Experiences Cards, broken-art Card, Saved Scripture, and Today’s Challenge 1 Finish away from earning Everyday Hospitality.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-6-earned-collections';
        s.completedChallengeIds = [
          'cms:ch-2026-11-04', 'cms:ch-2026-11-08', // Finish Nov 18 to earn Everyday Hospitality!
          'cms:ch-2026-11-06', 'cms:ch-2026-11-09', 'cms:ch-2026-11-11', // Earned Prayers in the Valley
          'cms:ch-2026-11-16', 'cms:ch-2026-11-17', // Earned Songs of Trust
          'cms:ch-2026-10-01', 'cms:ch-2026-10-02', 'cms:ch-2026-10-03', // Earned Oct Encouragement
          'cms:ch-2025-11-01', 'cms:ch-2025-11-02', // Earned Nov 2025 (broken art demo)
          'cms:fnd-patient-reading'
        ];
        s.seenMonthIntros = { '2026-11': true, '2026-10': true };
        s.earnedAwards = {
          'card-2026-11-valley-prayers': { cardId: 'card-2026-11-valley-prayers', earnedOn: '2026-11-11', cardViewed: false, hubAnnouncementAcked: false },
          'card-2026-11-songs-of-trust': { cardId: 'card-2026-11-songs-of-trust', earnedOn: '2026-11-17', cardViewed: false, hubAnnouncementAcked: false },
          'card-2026-10-encouragement': { cardId: 'card-2026-10-encouragement', earnedOn: '2026-11-05', cardViewed: true, hubAnnouncementAcked: true },
          'card-2025-11-gratitude': { cardId: 'card-2025-11-gratitude', earnedOn: '2026-10-20', cardViewed: true, hubAnnouncementAcked: true },
          'card-foundation-patient-reading': { cardId: 'card-foundation-patient-reading', earnedOn: '2026-11-14', cardViewed: true, hubAnnouncementAcked: true },
          'card-special-advent-2025-a': { cardId: 'card-special-advent-2025-a', earnedOn: '2025-12-18', cardViewed: true, hubAnnouncementAcked: true },
          'card-special-advent-2025-b': { cardId: 'card-special-advent-2025-b', earnedOn: '2025-12-21', cardViewed: true, hubAnnouncementAcked: true },
          'card-special-psalms-2026': { cardId: 'card-special-psalms-2026', earnedOn: '2026-04-09', cardViewed: false, hubAnnouncementAcked: true }
        };
        s.newDiscoveriesIndicator = true;
        s.savedScriptures = [
          {
            id: 'scr-saved-1',
            book: 'Psalms',
            reference: 'Psalm 23:1–3',
            text: SYNTHETIC_PASSAGES[0].text,
            sourceLabel: 'November 2026 • Opening the Door to Quiet Attention',
            savedOn: '2026-11-17'
          },
          {
            id: 'scr-saved-2',
            book: 'Romans',
            reference: 'Romans 12:9–13',
            text: SYNTHETIC_PASSAGES[2].text,
            sourceLabel: 'November 2026 • Bread Broken at an Unexpected Table',
            savedOn: '2026-11-12'
          },
          {
            id: 'scr-saved-3',
            book: 'Matthew',
            reference: 'Matthew 11:28–30',
            text: SYNTHETIC_PASSAGES[1].text,
            sourceLabel: 'October 2026 • Greeting One Another in Grace',
            savedOn: '2026-10-28'
          }
        ];
        s.shelf = {
          months: [
            { yearMonth: '2026-10', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-11-02' }
          ],
          activeFocusMonth: '2026-10'
        };
        return s;
      }
    },
    {
      id: 'g09-7-news-preferences',
      group: 'G09',
      shortLabel: '7. More, News & Preferences',
      description: 'Opens on More: featured Ministry Update, View All News categories/loading/empty/error/retry, Follow Bibleberry Seasons vs Choose My Colors, and independent Review Introduction & App Tutorial replay.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-7-news-preferences';
        s.activeTab = 'more';
        s.completedChallengeIds = ['cms:ch-2026-11-04', 'cms:ch-2026-11-08'];
        s.seenMonthIntros = { '2026-11': true };
        return s;
      }
    },
    {
      id: 'g09-8-accounts-merge',
      group: 'G09',
      shortLabel: '8. Accounts & Merge (G08)',
      description: 'Guest with 3 distinct completions (eligible for dismissible Today invitation) + simulated guest-to-account merge flows: Verified Success, Shelf Conflict (G08), Pending, and Partial Failure + Safe Retry.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'g09-8-accounts-merge';
        s.completedChallengeIds = ['cms:ch-2026-11-04', 'cms:ch-2026-11-08', 'cms:ch-2026-10-01'];
        s.seenMonthIntros = { '2026-11': true, '2026-10': true };
        s.shelf = {
          months: [
            { yearMonth: '2026-10', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-11-02' }
          ],
          activeFocusMonth: '2026-10'
        };
        s.savedScriptures = [
          {
            id: 'scr-guest-1',
            book: 'Isaiah',
            reference: 'Isaiah 40:28–31',
            text: SYNTHETIC_PASSAGES[3].text,
            sourceLabel: 'November 2026 • Strength Quietly Renewed in Waiting',
            savedOn: '2026-11-16'
          }
        ];
        return s;
      }
    },
    /* --- Edge / Negative / State Presets --- */
    {
      id: 'edge-empty-guest',
      group: 'Edge',
      shortLabel: 'Empty Guest (0 Cards / 0 Shelf)',
      description: 'Onboarded guest with zero completions, zero earned Cards, empty Shelf, and empty Saved Scripture — verifies calm honest empty states with zero gray silhouettes or hidden Foundations/Special Experiences entries.',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-empty-guest';
        s.seenMonthIntros = { '2026-11': true };
        return s;
      }
    },
    {
      id: 'edge-today-unavailable',
      group: 'Edge',
      shortLabel: 'Today Unavailable Fallback',
      description: 'Today’s Challenge is not yet server-released: neutral notice and Explore This Month primary action (no dead CTA, no missed-day blame).',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-today-unavailable';
        s.todayChallengeUnavailable = true;
        s.seenMonthIntros = { '2026-11': true };
        return s;
      }
    },
    {
      id: 'edge-preview-nov28',
      group: 'Edge',
      shortLabel: 'Nov 28 Advance Preview',
      description: 'Simulated date Nov 28, 2026: December 2026 advance preview available (shows theme, preview intro, and upcoming titles; withholds Welcome, manuscripts, and Monthly Discoveries).',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-preview-nov28';
        s.simulatedDate = '2026-11-28';
        s.seenMonthIntros = { '2026-11': true };
        return s;
      }
    },
    {
      id: 'edge-preview-feb27',
      group: 'Edge',
      shortLabel: 'Feb 27 Advance Preview',
      description: 'Simulated date Feb 27, 2026: verifies February 27 advance preview rule for March 2026 (withholds Welcome, manuscripts, and Monthly Discoveries).',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-preview-feb27';
        s.simulatedDate = '2026-02-27';
        s.seenMonthIntros = { '2026-02': true };
        return s;
      }
    },
    {
      id: 'edge-rollover-g02',
      group: 'Edge',
      shortLabel: 'G02 Prior-Month Rollover',
      description: 'Dec 1 rollover with NO Active Focus and an unfinished November Challenge: displays the one-time Continue Your Study rollover exception (subordinate to Active Focus).',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-rollover-g02';
        s.simulatedDate = '2026-12-01';
        s.completedChallengeIds = [];
        s.savedPositions = {
          'cms:ch-2026-11-28': { screenIndex: 1, updatedOn: '2026-11-30' }
        };
        s.seenMonthIntros = { '2026-11': true };
        s.rolloverInterruption = {
          eligible: true,
          consumed: false,
          priorYearMonth: '2026-11',
          challengeId: 'cms:ch-2026-11-28'
        };
        return s;
      }
    },
    {
      id: 'edge-rollover-g03',
      group: 'Edge',
      shortLabel: 'G03 Protected Shelf Rollover',
      description: 'Nov 30 with full 3-slot Shelf (Auto-admitted Active Focus Oct, Kept Sep, oldest unprotected Auto-admitted Aug) + 1 completed Nov Challenge. Trigger "Simulate Dec 1 Rollover" to verify G03 protects Active Focus & Kept!',
      build: function () {
        var s = createBaseState();
        s.scenarioId = 'edge-rollover-g03';
        s.simulatedDate = '2026-11-30';
        s.activeTab = 'library';
        s.completedChallengeIds = ['cms:ch-2026-11-04', 'cms:ch-2026-10-01', 'cms:ch-2026-09-01', 'cms:ch-2026-08-01'];
        s.seenMonthIntros = { '2026-11': true, '2026-10': true, '2026-09': true, '2026-08': true };
        s.shelf = {
          months: [
            { yearMonth: '2026-10', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-11-01' },
            { yearMonth: '2026-09', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-10-01' },
            { yearMonth: '2026-08', admissionKind: 'autoAdmitted', protected: false, admittedOn: '2026-09-01' }
          ],
          activeFocusMonth: '2026-10'
        };
        return s;
      }
    }
  ];

  var SCENARIOS_BY_ID = {};
  SCENARIOS.forEach(function (sc) { SCENARIOS_BY_ID[sc.id] = sc; });

  return {
    MONTH_NAMES: MONTH_NAMES,
    SHORT_MONTHS: SHORT_MONTHS,
    MONTHS_LIST: MONTHS_LIST,
    MONTHS_BY_ID: MONTHS_BY_ID,
    CHALLENGES_BY_ID: CHALLENGES_BY_ID,
    CARDS_BY_ID: CARDS_BY_ID,
    FOUNDATIONS: FOUNDATIONS,
    FOUNDATIONS_BY_ID: FOUNDATIONS_BY_ID,
    NEWS_ARTICLES: NEWS_ARTICLES,
    EXTERNAL_LINKS: EXTERNAL_LINKS,
    SCENARIOS: SCENARIOS,
    SCENARIOS_BY_ID: SCENARIOS_BY_ID,
    formatYearMonth: formatYearMonth,
    formatCivilDate: formatCivilDate,
    formatShortDate: formatShortDate,
    allChallengeIdsForMonth: allChallengeIdsForMonth
  };
})();
