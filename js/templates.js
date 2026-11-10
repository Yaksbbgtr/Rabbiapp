/*
 * Parent message templates and the engine that fills them in.
 *
 * Placeholders:  {name} {parent} {rebbi} {class} {parsha} {date} {hebdate}
 *                {detail}      what the rebbi types in (made into a full sentence)
 *                {strengths}   limud units he knows well      (from the Limud page)
 *                {working_on}  limud units he is still learning
 *                {bechina} {score}  his most recent graded bechina
 *                {absences}    absences in the last 30 days (only when 2 or more)
 *
 * Anything inside [[double brackets]] is left out completely when a
 * placeholder inside it has nothing to fill in, so messages never contain
 * blanks or half sentences.
 *
 * Works in the browser (window.MessageTemplates) and in Node for tests.
 */
(function (root) {
  'use strict';

  var VERSION = 2;

  var DEFAULTS = [
    {
      name: 'Sharing nachas',
      ask: 'What did he do that made you proud?',
      eg: 'e.g. he helped a new boy find the place in the Chumash without being asked',
      body: 'Dear {parent},\n\n' +
        'I wanted to take a minute to share some nachas with you. {name} had a really wonderful week in {class}.\n\n' +
        '[[{detail}]]\n\n' +
        '[[He is also doing very nicely in his learning. He knows {strengths} well, and it shows when he answers in class.]]\n\n' +
        'Moments like these are what a rebbi hopes for, and I wanted you to hear about it right away. Please tell {name} that his rebbi wrote to you and is very proud of him. Hearing it from you means even more to him than hearing it from me.\n\n' +
        'May you continue to have much nachas from him!\n\n{rebbi}'
    },
    {
      name: 'Weekly update & parsha',
      ask: 'Anything special from this week? (optional)',
      eg: 'e.g. we finished the perek and made a siyum on Thursday',
      body: 'Dear {parent},\n\n' +
        'A short update from {class}. This week we are learning Parshas {parsha}[[, and {name} is working on {working_on}]].\n\n' +
        '[[{detail}]]\n\n' +
        '[[I am happy to tell you that he already knows {strengths} well.]]\n\n' +
        'Over Shabbos, please ask {name} to tell you something from the parsha at the Shabbos table, and to go over his sheet with you. A few minutes of chazara with a parent makes a very big difference, and the boys love showing what they know.\n\n' +
        'Have a wonderful Shabbos,\n{rebbi}'
    },
    {
      name: 'Needs chazara at home',
      ask: 'What would help him most at home?',
      eg: 'e.g. reading the pesukim aloud for ten minutes each night',
      body: 'Dear {parent},\n\n' +
        'I am writing because I want to make sure {name} keeps up with the class, and I would appreciate your help.\n\n' +
        '[[Right now he needs more review on {working_on}. ]]He is trying in class, but this material needs extra chazara at home to stay with him.\n\n' +
        '[[What I think would help most: {detail}]]\n\n' +
        '[[I also want you to know what is going well: he knows {strengths}, and he should feel good about that.]]\n\n' +
        'Even ten minutes a night makes a real difference. If the evenings are difficult, or if you see that he is struggling with the material, please let me know and we will work out a plan together.\n\n' +
        'Thank you for your partnership,\n{rebbi}'
    },
    {
      name: 'Missing sheet or homework',
      ask: 'What is missing?',
      eg: 'e.g. his signed chazara sheet, three times this week',
      body: 'Dear {parent},\n\n' +
        'I wanted to let you know that {name} has been coming to class without his work.\n\n' +
        '[[What is missing: {detail}]]\n\n' +
        'I know how busy the evenings and mornings are, and I am sure this is just something that slipped. The chazara at home is a big part of how the boys hold on to what we learn, so I do not want him to fall behind.\n\n' +
        'Could you please check his bag with him tonight, and help him set a regular time for it? If something is making it hard for him, please tell me and I will gladly work with you.\n\n' +
        'Thank you so much,\n{rebbi}'
    },
    {
      name: 'Behavior concern',
      ask: 'What happened? (just the facts)',
      eg: 'e.g. he called out during davening several times and distracted the boys near him',
      body: 'Dear {parent},\n\n' +
        'I am reaching out about something that came up in class, because I would rather we work on it together early.\n\n' +
        '[[{detail}]]\n\n' +
        'I want to be clear that {name} is a good boy and I enjoy having him in my class. [[He has real strengths; for example, he knows {strengths}. ]]This is something I am confident he can improve with a little help from both of us.\n\n' +
        'I spoke with him about it in class. It would help very much if you could also talk with him calmly at home, so that he hears the same message from both of us. Please let me know if there is anything going on that I should be aware of, or a good time for a short phone call.\n\n' +
        'Thank you for your help,\n{rebbi}'
    },
    {
      name: 'Bechina results',
      ask: 'Any comment on how he did? (optional)',
      eg: 'e.g. he knew every Rashi, and only lost points on the last question',
      body: 'Dear {parent},\n\n' +
        '[[{name} took the {bechina}, and his mark was {score}.]]\n\n' +
        '[[{detail}]]\n\n' +
        '[[He knows {strengths} well. ]][[He still needs more review on {working_on}.]]\n\n' +
        'Please look over the bechina together with {name}, sign it, and send it back with him. Going over the questions he missed, while it is still fresh, is the best chazara there is.\n\n' +
        'Thank you,\n{rebbi}'
    },
    {
      name: 'We missed him (absent)',
      ask: 'What did the class learn while he was out? (optional)',
      eg: 'e.g. pesukim 6-15 in the parsha and the second mishna',
      body: 'Dear {parent},\n\n' +
        'We missed {name} in yeshiva, and I hope he is feeling well.[[ He has been out {absences} times in the past month, so I wanted to check in and see if there is anything I can do to help.]]\n\n' +
        '[[While he was out, the class learned this: {detail}]]\n\n' +
        'When he comes back I will sit with him to help him catch up, so he should not worry about what he missed. If you would like the sheets sent home in the meantime, just let me know.\n\n' +
        'Wishing him a refuah sheleimah if he is not well,\n{rebbi}'
    },
    {
      name: 'Please call me',
      ask: 'What would you like to discuss?',
      eg: 'e.g. how he is settling in with the other boys',
      body: 'Dear {parent},\n\n' +
        'I would like to speak with you about {name} when you have a few minutes.\n\n' +
        '[[What I would like to discuss: {detail}]]\n\n' +
        'It is nothing urgent, but I find that a short conversation is much better than notes back and forth. Please let me know a time that works for you, or call me after yeshiva hours.\n\n' +
        'Thank you,\n{rebbi}'
    }
  ];

  // The three templates the app first shipped with (replaced on upgrade if unedited).
  var OLD_BODIES = [
    'Dear {parent},\n\nI wanted to share that {name} had a wonderful week! He {highlight}. You should have much nachas!\n\n{rebbi}',
    'Dear Parents,\n\nThis week we are learning Parshas {parsha}. Please review the attached sheet with {name} over Shabbos.\n\nGood Shabbos,\n{rebbi}',
    'Dear {parent},\n\n{name} has not been bringing his chazara sheet signed. Could you please help him remember? Thank you for your partnership!\n\n{rebbi}'
  ];

  function defaults(uid) {
    return DEFAULTS.map(function (t) { return { id: uid(), name: t.name, ask: t.ask, eg: t.eg, body: t.body }; });
  }

  // Bring saved data up to the current set of templates, keeping any the rebbi wrote or edited.
  function upgrade(data, uid) {
    if (data.templatesVersion === VERSION) return;
    var kept = (data.templates || []).filter(function (t) { return OLD_BODIES.indexOf(t.body) < 0; });
    data.templates = defaults(uid).concat(kept);
    data.templatesVersion = VERSION;
  }

  // "great interactions with friends" -> "Great interactions with friends."
  function sentence(text) {
    var s = String(text || '').trim().replace(/\s+/g, ' ');
    if (!s) return '';
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return /[.!?…:]$/.test(s) ? s : s + '.';
  }

  function joinList(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function fillPlain(text, vals) {
    return text.replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined && vals[k] !== null ? vals[k] : m; });
  }

  function fill(body, vals) {
    vals = Object.assign({}, vals);
    if (vals.detail !== undefined) vals.detail = sentence(vals.detail);
    if (vals.highlight === undefined) vals.highlight = vals.detail ? vals.detail.replace(/[.]$/, '') : '';
    // Optional parts: drop the whole [[...]] when something inside is empty.
    var out = String(body || '').replace(/\[\[([\s\S]*?)\]\]/g, function (m, inner) {
      var missing = false;
      inner.replace(/\{(\w+)\}/g, function (mm, k) { if (!vals[k]) missing = true; });
      return missing ? '' : fillPlain(inner, vals);
    });
    out = fillPlain(out, vals);
    return out
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .replace(/ ([.,!?])/g, '$1')
      .trim();
  }

  var api = { VERSION: VERSION, defaults: defaults, upgrade: upgrade, fill: fill, sentence: sentence, joinList: joinList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MessageTemplates = api;
})(typeof window !== 'undefined' ? window : this);
