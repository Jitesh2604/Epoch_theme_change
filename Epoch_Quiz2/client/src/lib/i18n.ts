import { createContext, useContext } from 'react';

// Only ship languages with complete, production-ready translations. Add a
// locale back to this union (and a matching block in `T` below) once its
// translations are complete and a language-switcher UI exists to expose it —
// see useLang()/setLang for the (currently unused) plumbing that already
// supports more than one language.
export type Lang = 'EN' | 'HI';

const T: Record<Lang, Record<string, string>> = {
  EN: {
    'nav.home': 'Home',
    'nav.quizPlay': 'Play Olympiad',
    'nav.faq': 'FAQ',
    'nav.more': 'More',
    'nav.aboutUs': 'About us',
    'nav.contactUs': 'Contact us',
    'nav.privacyPolicy': 'Privacy policy',
    'nav.termsConditions': 'Terms & conditions',
    'nav.profile': 'Profile',
    'nav.logout': 'Logout',

    'home.howItWorks': 'How it works',
    'home.whyChooseUs': 'Why choose us',
    'home.startAQuiz': 'Start a quiz',
    'home.aboutEpoch': 'About Epoch',
    'home.jumpIn': 'Jump in',
    'home.pickCategoryAndStart': 'Pick your category and start.',
    'home.quizzes': 'quizzes',
    'home.topics': 'topics',

    'page.chooseCategory': 'Choose your category.',
    'page.twoQuizModes': 'Pick a subject and a difficulty to begin your practice quiz — self-paced, no teacher required.',

    'level.perQuestion': '/ question',

    'quiz.pause': 'Pause',
    'quiz.resume': 'Resume',
    'quiz.timesUp': "Time's up.",

    'result.avgTime': 'Avg. time / question',
    'result.leaderboardRank': 'Leaderboard rank',
    'result.leaderboard': 'Leaderboard',
    'result.thisWeek': 'This week',
    'result.totalPlayers': 'Total players this week',
    'result.you': 'you',

    'faq.title': 'Frequently asked questions',
    'faq.body': 'Everything you need to know about playing quizzes, scoring, timers, and getting around the app — should take you under two minutes to read.',
    'faq.sectionStart': 'Getting started',
    'faq.start.q': 'How do I start a quiz?',
    'faq.start.a': 'Subject Practice for one topic at a time — timed by difficulty — or Practice Olympiad for a self-paced mixed set across all your subjects. Assessments assigned by your school show up separately in your dashboard.',
    'faq.subjectDifficulty.q': 'How do I pick a subject and difficulty?',
    'faq.subjectDifficulty.a': 'Subjects are taxonomy-tagged to curriculum boards, each with its own question bank. Difficulty — Easy, Medium, or Hard — picks which tier of questions gets pulled into your set, and (for Subject Practice) how many questions and how much time you get.',
    'faq.answerSubmit.q': 'How do I answer and submit questions?',
    'faq.answerSubmit.a': 'One question at a time. Pick an option, hit Submit. You can also Skip — it counts as no answer.',
    'faq.results.q': 'How do I see my results?',
    'faq.results.a': 'Every quiz ends with a per-question review and your score. Retry as often as you like — only graded Assessments count toward the leaderboard.',
    'faq.sectionScoring': 'Scoring',
    'faq.scoreCorrect.q': 'What happens when I answer correctly?',
    'faq.scoreCorrect.a': 'Full marks for the question, exactly as your teacher or admin set them. No speed bonus — take the time you need.',
    'faq.scoreWrong.q': 'What happens when I answer incorrectly?',
    'faq.scoreWrong.a': "No marks deducted. You can review it afterwards in the question's explanation.",
    'faq.scoreSkip.q': 'What happens if I skip a question?',
    'faq.scoreSkip.a': 'Treated as no answer. No points awarded, no penalty.',
    'faq.sectionTimers': 'Timers',
    'faq.timerPractice.q': 'Is there a time limit for Subject Practice?',
    'faq.timerPractice.a': 'Each attempt gets a fixed time limit based on the difficulty you choose. Once you start, a countdown runs and the quiz submits automatically if time runs out.',
    'faq.timerOlympiad.q': 'Is there a time limit for Practice Olympiad?',
    'faq.timerOlympiad.a': 'No clock at all — answer at your own pace, always.',
    'faq.timerAssessment.q': 'Is there a time limit for Assessments?',
    'faq.timerAssessment.a': "Each Assessment has one overall duration, set by your school. It auto-submits whatever you've answered when time runs out.",
    'faq.timerResume.q': 'What happens if I close an Assessment before finishing?',
    'faq.timerResume.a': "Reopening it resumes exactly where you left off — the clock keeps running in the background.",
    'faq.sectionNavigation': 'Navigation & quitting',
    'faq.navBack.q': 'Can I go back to a previous question?',
    'faq.navBack.a': "Once you submit, you can't go back. This keeps results honest.",
    'faq.navQuit.q': 'Can I quit a quiz early?',
    'faq.navQuit.a': "Use the Quit button in the top-left. Progress isn't saved — start over.",

    'common.backToQuizPlay': '← Back to quiz play',
    'common.backHome': 'Back home',
    'common.startAQuiz': 'Start a quiz',
    'common.noResult': 'No result to show.',

    'footer.description': 'An Olympiad practice platform for students — subject-wise practice with instant results, mixed Practice Olympiad quizzes, and official school assessments published by your admin.',
    'footer.product': 'Product',
    'footer.company': 'Company',
    'footer.legal': 'Legal',
    'footer.home': 'Home',
    'footer.quizLibrary': 'Quiz library',
    'footer.howItWorks': 'How it works',
    'footer.aboutUs': 'About us',
    'footer.contactUs': 'Contact us',
    'footer.privacyPolicy': 'Privacy policy',
    'footer.termsConditions': 'Terms & conditions',
    'footer.copyright': '© 2026 Epoch Inc.',
    'footer.tagline': 'Made for students.',
  },

  HI: {
    'nav.home': 'होम',
    'nav.quizPlay': 'क्विज़ खेलें',
    'nav.faq': 'सामान्य प्रश्न',
    'nav.more': 'और',
    'nav.aboutUs': 'हमारे बारे में',
    'nav.contactUs': 'संपर्क करें',
    'nav.privacyPolicy': 'गोपनीयता नीति',
    'nav.termsConditions': 'नियम और शर्तें',
    'nav.profile': 'प्रोफ़ाइल',
    'nav.logout': 'लॉग आउट',

    'home.howItWorks': 'यह कैसे काम करता है',
    'home.whyChooseUs': 'हमें क्यों चुनें',
    'home.startAQuiz': 'क्विज़ शुरू करें',
    'home.aboutEpoch': 'Epoch के बारे में',
    'home.jumpIn': 'अभी शुरू करें',
    'home.pickCategoryAndStart': 'अपनी श्रेणी चुनें और शुरू करें।',
    'home.quizzes': 'क्विज़',
    'home.topics': 'विषय',

    'page.chooseCategory': 'अपनी श्रेणी चुनें।',
    'page.twoQuizModes': 'अपना अभ्यास क्विज़ शुरू करने के लिए एक विषय और कठिनाई चुनें — स्व-गति से, बिना किसी शिक्षक के।',

    'level.perQuestion': '/ प्रश्न',

    'quiz.pause': 'रोकें',
    'quiz.resume': 'जारी रखें',
    'quiz.timesUp': 'समय समाप्त।',

    'result.avgTime': 'औसत समय / प्रश्न',
    'result.leaderboardRank': 'लीडरबोर्ड रैंक',
    'result.leaderboard': 'लीडरबोर्ड',
    'result.thisWeek': 'इस सप्ताह',
    'result.totalPlayers': 'इस सप्ताह कुल खिलाड़ी',
    'result.you': 'आप',

    'faq.title': 'अक्सर पूछे जाने वाले सवाल',
    'faq.body': 'क्विज़ खेलने, स्कोरिंग, टाइमर और ऐप में नेविगेट करने से जुड़ी हर जानकारी — पढ़ने में दो मिनट से कम लगेंगे।',
    'faq.sectionStart': 'शुरुआत कैसे करें',
    'faq.start.q': 'मैं क्विज़ कैसे शुरू करूं?',
    'faq.start.a': 'एक समय में एक विषय के लिए Subject Practice — कठिनाई के अनुसार समयबद्ध — या आपके सभी विषयों के मिश्रित सेट के लिए Practice Olympiad, जो स्व-गति से होता है। आपके स्कूल द्वारा सौंपे गए Assessments आपके डैशबोर्ड में अलग से दिखते हैं।',
    'faq.subjectDifficulty.q': 'मैं विषय और कठिनाई कैसे चुनूं?',
    'faq.subjectDifficulty.a': 'विषय पाठ्यक्रम बोर्डों के अनुसार टैग किए गए हैं, प्रत्येक का अपना प्रश्न बैंक है। कठिनाई — आसान, मध्यम या कठिन — तय करती है कि किस स्तर के प्रश्न चुने जाएंगे, और (Subject Practice के लिए) आपको कितने प्रश्न और कितना समय मिलेगा।',
    'faq.answerSubmit.q': 'मैं प्रश्नों के उत्तर कैसे दूं और सबमिट कैसे करूं?',
    'faq.answerSubmit.a': 'एक बार में एक प्रश्न। विकल्प चुनें, Submit करें। Skip भी कर सकते हैं — इसे कोई उत्तर नहीं माना जाता।',
    'faq.results.q': 'मैं अपने परिणाम कैसे देखूं?',
    'faq.results.a': 'हर क्विज़ के अंत में प्रश्न-दर-प्रश्न समीक्षा और आपका स्कोर मिलता है। जितनी बार चाहें दोबारा खेलें — केवल ग्रेडेड Assessments ही लीडरबोर्ड में गिने जाते हैं।',
    'faq.sectionScoring': 'स्कोरिंग',
    'faq.scoreCorrect.q': 'सही उत्तर देने पर क्या होता है?',
    'faq.scoreCorrect.a': 'प्रश्न के पूरे अंक, ठीक वैसे ही जैसे आपके शिक्षक या एडमिन ने तय किए हैं। कोई स्पीड बोनस नहीं — जितना समय चाहिए लें।',
    'faq.scoreWrong.q': 'गलत उत्तर देने पर क्या होता है?',
    'faq.scoreWrong.a': 'कोई कटौती नहीं। आप इसे बाद में प्रश्न की व्याख्या में देख सकते हैं।',
    'faq.scoreSkip.q': 'अगर मैं कोई प्रश्न छोड़ दूं तो क्या होता है?',
    'faq.scoreSkip.a': 'कोई उत्तर नहीं माना जाता। कोई अंक नहीं मिलते, कोई दंड नहीं।',
    'faq.sectionTimers': 'टाइमर',
    'faq.timerPractice.q': 'क्या Subject Practice के लिए समय-सीमा है?',
    'faq.timerPractice.a': 'आपकी चुनी हुई कठिनाई के अनुसार हर अटेम्प्ट को एक तय समय-सीमा मिलती है। शुरू करते ही उलटी गिनती चलने लगती है और समय समाप्त होने पर क्विज़ अपने-आप सबमिट हो जाता है।',
    'faq.timerOlympiad.q': 'क्या Practice Olympiad के लिए समय-सीमा है?',
    'faq.timerOlympiad.a': 'बिल्कुल कोई टाइमर नहीं — हमेशा अपनी गति से उत्तर दें।',
    'faq.timerAssessment.q': 'क्या Assessments के लिए समय-सीमा है?',
    'faq.timerAssessment.a': 'हर Assessment की एक कुल अवधि होती है, जो आपके स्कूल द्वारा तय की जाती है। समय समाप्त होने पर जो भी उत्तर दिए गए हैं वे स्वतः सबमिट हो जाते हैं।',
    'faq.timerResume.q': 'अगर मैं किसी Assessment को पूरा किए बिना बंद कर दूं तो क्या होता है?',
    'faq.timerResume.a': 'दोबारा खोलने पर वहीं से जारी रहता है जहां आपने छोड़ा था — टाइमर पृष्ठभूमि में चलता रहता है।',
    'faq.sectionNavigation': 'नेविगेशन और छोड़ना',
    'faq.navBack.q': 'क्या मैं पिछले प्रश्न पर वापस जा सकता हूं?',
    'faq.navBack.a': 'एक बार सबमिट करने के बाद वापस नहीं जा सकते। इससे परिणाम ईमानदार रहते हैं।',
    'faq.navQuit.q': 'क्या मैं क्विज़ बीच में छोड़ सकता हूं?',
    'faq.navQuit.a': 'ऊपर-बाईं ओर Quit बटन का उपयोग करें। प्रगति सहेजी नहीं जाती — फिर से शुरू करें।',

    'common.backToQuizPlay': '← क्विज़ पर वापस जाएं',
    'common.backHome': 'होम पर वापस जाएं',
    'common.startAQuiz': 'क्विज़ शुरू करें',
    'common.noResult': 'कोई परिणाम नहीं।',

    'footer.description': 'छात्रों के लिए एक Olympiad अभ्यास मंच — तुरंत परिणाम के साथ विषय-वार अभ्यास, मिश्रित Practice Olympiad क्विज़, और आपके एडमिन द्वारा प्रकाशित आधिकारिक स्कूल Assessments।',
    'footer.product': 'उत्पाद',
    'footer.company': 'कंपनी',
    'footer.legal': 'कानूनी',
    'footer.home': 'होम',
    'footer.quizLibrary': 'क्विज़ लाइब्रेरी',
    'footer.howItWorks': 'यह कैसे काम करता है',
    'footer.aboutUs': 'हमारे बारे में',
    'footer.contactUs': 'संपर्क करें',
    'footer.privacyPolicy': 'गोपनीयता नीति',
    'footer.termsConditions': 'नियम और शर्तें',
    'footer.copyright': '© 2026 Epoch Inc.',
    'footer.tagline': 'छात्रों के लिए बनाया गया।',
  },
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const LangContext = createContext<LangCtx>({ lang: 'EN', setLang: () => {} });

export function useT(): (key: string) => string {
  const { lang } = useContext(LangContext);
  return (key: string) => T[lang]?.[key] ?? T.EN[key] ?? key;
}

export function useLang(): LangCtx {
  return useContext(LangContext);
}
