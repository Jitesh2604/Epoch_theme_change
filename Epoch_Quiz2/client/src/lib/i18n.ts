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
    'nav.quizPlay': 'Play Olympaid',
    'nav.instructions': 'Instructions',
    'nav.more': 'More',
    'nav.aboutUs': 'About us',
    'nav.contactUs': 'Contact us',
    'nav.privacyPolicy': 'Privacy policy',
    'nav.termsConditions': 'Terms & conditions',
    'nav.profile': 'Profile',
    'nav.logout': 'Logout',

    'home.howItWorks': 'How it works',
    'home.freeTrial': '· 14-day free trial',
    'home.noCard': '· No card required',
    'home.cancelAnytime': '· Cancel anytime',
    'home.whyChooseUs': 'Why choose us',
    'home.startAQuiz': 'Start a quiz',
    'home.aboutEpoch': 'About Epoch',
    'home.jumpIn': 'Jump in',
    'home.pickCategoryAndStart': 'Pick your category and start.',
    'home.quizzes': 'quizzes',
    'home.topics': 'topics',

    'page.chooseCategory': 'Choose your category.',
    'page.twoQuizModes': 'Two quiz modes — Practice Olympaid for self-paced learning, Attempt Olympaid for graded results. Pick a subject and a difficulty to begin.',

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

    'instr.title': 'How Olympaid Epoch Quiz works.',
    'instr.body': 'Four short sections — the format, the scoring, the timer rules, and how to get around the app. Should take you under two minutes to read.',
    'instr.howToPlay': 'How to play',
    'instr.step1.t': 'Choose how to play',
    'instr.step1.d': 'Subject Practice for one topic at a time, or Practice Olympiad for a mixed set across all your subjects — both self-paced, no clock running. Assessments assigned by your school show up separately in your dashboard.',
    'instr.step2.t': 'Pick a subject',
    'instr.step2.d': 'Subjects are taxonomy-tagged to curriculum boards. Each carries its own question bank.',
    'instr.step3.t': 'Choose a difficulty',
    'instr.step3.d': 'Easy, Medium, or Hard — this picks which difficulty tier of questions gets pulled into your set. No time pressure either way.',
    'instr.step4.t': 'Answer & submit',
    'instr.step4.d': 'One question at a time. Pick an option, hit Submit. You can also Skip — counts as no answer.',
    'instr.step5.t': 'Review your results',
    'instr.step5.d': 'Every quiz ends with a per-question review and your score. Retry as often as you like — only graded Assessments count toward the leaderboard.',
    'instr.scoringRules': 'Scoring rules',
    'instr.score1.t': 'Correct answer',
    'instr.score1.d': 'Full marks for the question, exactly as your teacher or admin set them. No speed bonus — take the time you need.',
    'instr.score2.t': 'Wrong answer',
    'instr.score2.d': "No marks deducted. You can review it afterwards in the question's explanation.",
    'instr.score3.t': 'Skipped',
    'instr.score3.d': 'Treated as no answer. No points awarded, no penalty.',
    'instr.timerRules': 'Timer rules',
    'instr.timer1.t': 'Practice modes',
    'instr.timer1.d': 'Subject Practice and Practice Olympiad have no clock at all — answer at your own pace, always.',
    'instr.timer2.t': 'Assessments',
    'instr.timer2.d': "Each Assessment has one overall duration, set by your school. It auto-submits whatever you've answered when time runs out.",
    'instr.timer3.t': 'Leaving and coming back',
    'instr.timer3.d': "If you close an Assessment before finishing, reopening it resumes exactly where you left off — the clock keeps running in the background.",
    'instr.navigation': 'Navigation',
    'instr.nav1.t': 'Forward only',
    'instr.nav1.d': "Once you submit, you can't go back. This keeps results honest.",
    'instr.nav2.t': 'Quit anytime',
    'instr.nav2.d': "Use the Quit button in the top-left. Progress isn't saved — start over.",

    'common.backToQuizPlay': '← Back to quiz play',
    'common.backHome': 'Back home',
    'common.startAQuiz': 'Start a quiz',
    'common.noResult': 'No result to show.',

    'footer.description': 'The AI-powered quiz workspace for educators, learners, and editorial teams. Built on the same backbone as Epoch GPT AI.',
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
    'footer.tagline': 'Made for learners, editors, and curriculum teams.',
  },

  HI: {
    'nav.home': 'होम',
    'nav.quizPlay': 'क्विज़ खेलें',
    'nav.instructions': 'निर्देश',
    'nav.more': 'और',
    'nav.aboutUs': 'हमारे बारे में',
    'nav.contactUs': 'संपर्क करें',
    'nav.privacyPolicy': 'गोपनीयता नीति',
    'nav.termsConditions': 'नियम और शर्तें',
    'nav.profile': 'प्रोफ़ाइल',
    'nav.logout': 'लॉग आउट',

    'home.howItWorks': 'यह कैसे काम करता है',
    'home.freeTrial': '· 14-दिन का निःशुल्क ट्रायल',
    'home.noCard': '· कोई कार्ड ज़रूरी नहीं',
    'home.cancelAnytime': '· कभी भी रद्द करें',
    'home.whyChooseUs': 'हमें क्यों चुनें',
    'home.startAQuiz': 'क्विज़ शुरू करें',
    'home.aboutEpoch': 'Epoch के बारे में',
    'home.jumpIn': 'अभी शुरू करें',
    'home.pickCategoryAndStart': 'अपनी श्रेणी चुनें और शुरू करें।',
    'home.quizzes': 'क्विज़',
    'home.topics': 'विषय',

    'page.chooseCategory': 'अपनी श्रेणी चुनें।',
    'page.twoQuizModes': 'दो क्विज़ मोड — स्व-गति से सीखने के लिए Practice Olympiad, ग्रेडेड परिणामों के लिए Attempt Olympiad। शुरू करने के लिए एक विषय और कठिनाई चुनें।',

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

    'instr.title': 'Olympaid Epoch Quiz कैसे काम करता है।',
    'instr.body': 'चार छोटे खंड — प्रारूप, स्कोरिंग, टाइमर नियम और ऐप नेविगेशन। पढ़ने में दो मिनट से कम लगेंगे।',
    'instr.howToPlay': 'कैसे खेलें',
    'instr.step1.t': 'खेलने का तरीका चुनें',
    'instr.step1.d': 'एक समय में एक विषय के लिए Subject Practice, या आपके सभी विषयों के मिश्रित सेट के लिए Practice Olympiad — दोनों में कोई टाइमर नहीं। आपके स्कूल द्वारा सौंपे गए Assessments आपके डैशबोर्ड में अलग से दिखते हैं।',
    'instr.step2.t': 'विषय चुनें',
    'instr.step2.d': 'विषय पाठ्यक्रम बोर्डों के अनुसार टैग किए गए हैं। प्रत्येक का अपना प्रश्न बैंक है।',
    'instr.step3.t': 'कठिनाई चुनें',
    'instr.step3.d': 'आसान, मध्यम या कठिन — यह तय करता है कि किस कठिनाई स्तर के प्रश्न चुने जाएंगे। दोनों ही स्थिति में कोई समय-दबाव नहीं।',
    'instr.step4.t': 'उत्तर दें और सबमिट करें',
    'instr.step4.d': 'एक बार में एक प्रश्न। विकल्प चुनें, Submit करें। Skip भी कर सकते हैं — कोई उत्तर नहीं माना जाता।',
    'instr.step5.t': 'अपने परिणाम देखें',
    'instr.step5.d': 'हर क्विज़ के अंत में प्रश्न-दर-प्रश्न समीक्षा और आपका स्कोर मिलता है। जितनी बार चाहें दोबारा खेलें — केवल ग्रेडेड Assessments ही लीडरबोर्ड में गिने जाते हैं।',
    'instr.scoringRules': 'स्कोरिंग नियम',
    'instr.score1.t': 'सही उत्तर',
    'instr.score1.d': 'प्रश्न के पूरे अंक, ठीक वैसे ही जैसे आपके शिक्षक या एडमिन ने तय किए हैं। कोई स्पीड बोनस नहीं — जितना समय चाहिए लें।',
    'instr.score2.t': 'गलत उत्तर',
    'instr.score2.d': 'कोई कटौती नहीं। आप इसे बाद में प्रश्न की व्याख्या में देख सकते हैं।',
    'instr.score3.t': 'छोड़ा',
    'instr.score3.d': 'कोई उत्तर नहीं माना जाता। कोई अंक नहीं मिलते, कोई दंड नहीं।',
    'instr.timerRules': 'टाइमर नियम',
    'instr.timer1.t': 'Practice मोड',
    'instr.timer1.d': 'Subject Practice और Practice Olympiad में बिल्कुल कोई टाइमर नहीं — हमेशा अपनी गति से उत्तर दें।',
    'instr.timer2.t': 'Assessments',
    'instr.timer2.d': 'हर Assessment की एक कुल अवधि होती है, जो आपके स्कूल द्वारा तय की जाती है। समय समाप्त होने पर जो भी उत्तर दिए गए हैं वे स्वतः सबमिट हो जाते हैं।',
    'instr.timer3.t': 'बीच में छोड़ना और वापस आना',
    'instr.timer3.d': 'अगर आप किसी Assessment को पूरा किए बिना बंद करते हैं, तो दोबारा खोलने पर वहीं से जारी रहता है जहाँ आपने छोड़ा था — टाइमर पृष्ठभूमि में चलता रहता है।',
    'instr.navigation': 'नेविगेशन',
    'instr.nav1.t': 'केवल आगे',
    'instr.nav1.d': 'एक बार सबमिट करने के बाद वापस नहीं जा सकते। इससे परिणाम ईमानदार रहते हैं।',
    'instr.nav2.t': 'कभी भी छोड़ें',
    'instr.nav2.d': 'ऊपर-बाईं ओर Quit बटन का उपयोग करें। प्रगति सहेजी नहीं जाती — फिर से शुरू करें।',

    'common.backToQuizPlay': '← क्विज़ पर वापस जाएं',
    'common.backHome': 'होम पर वापस जाएं',
    'common.startAQuiz': 'क्विज़ शुरू करें',
    'common.noResult': 'कोई परिणाम नहीं।',

    'footer.description': 'शिक्षकों, शिक्षार्थियों और संपादकीय टीमों के लिए AI-संचालित क्विज़ वर्कस्पेस।',
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
    'footer.tagline': 'शिक्षार्थियों, संपादकों और पाठ्यक्रम टीमों के लिए बनाया गया।',
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
