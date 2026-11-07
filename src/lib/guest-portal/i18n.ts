/**
 * Guest portal wording in English, Hindi, Kannada and Tulu (Kannada script).
 * Hindi, Kannada and Tulu are drafts for native-speaker review; keep keys identical across languages.
 */
import type { LanguageCode } from "@/lib/invitations/content";

export type PortalStrings = {
  brand: string; footer: string; privateInvitation: string; checking: string; unavailable: string; language: string;
  celebrationWith: string; ourFamily: string; welcome: (name: string) => string; proxyNote: (names: string) => string; onlyYours: string;
  notAvailableTitle: string; proxyAccess: string; yourInvitation: string; invitations: (count: number) => string; contactHosts: string;
  dateTbc: string; timeTbc: string; endsNextDay: string; dressCode: string; openMap: string; confirmed: string; tentative: string;
  responseFor: (name: string) => string; yes: string; no: string; maybe: string; addNote: string; noteLabel: string;
  yesToAll: (name: string) => string; saving: string; saveAll: string;
  dietaryTitle: string; dietaryIntro: string; meal: string; allergies: string; assistance: string; savingInfo: string; saveInfo: string;
  replyEveryoneTitle: string; replyEveryoneButton: string; replyEveryoneConfirm: (count: number) => string; saveForEveryone: string; cancel: string;
  yourPlan: string; items: (count: number) => string; everyone: string; addToCalendar: string; map: string; timingTbc: string;
  stayAt: (place: string) => string; until: (date: string) => string; pickup: string; departureRide: string; ride: string;
  travelTitle: string; checkIn: (date: string, time: string) => string; checkOut: (date: string, time: string) => string;
  arrivalTransfer: string; departureTransfer: string; transfer: string; fromTo: (from: string, to: string) => string; travelHelp: string;
  // Invitation website.
  openInvitation: string; navInvitation: string; navPlan: string; navReply: string; navStory: string; navFaq: string; navBlessings: string;
  countdownTitle: (name: string) => string; days: (n: number) => string; hours: (n: number) => string; minutes: (n: number) => string;
  liveNow: string; watchLive: string; ourStory: string; faqTitle: string; palette: string;
  blessingsTitle: string; blessingsIntro: string; blessingPlaceholder: string; sendBlessing: string; sendingBlessing: string;
  blessingThanks: string; blessingPending: (n: number) => string; blessingLimit: string; noBlessingsYet: string;
  revealTitle: string; infoTitle: string; navInfo: string; call: string; closingTitle: string; shareMoments: string;
  previewBanner: string; previewUntil: (time: string) => string; previewRsvpOff: string; previewGuest: string;
  // Server results, shown after saving.
  savedResponses: (count: number) => string; alreadySaved: string; savedInfo: string; conflict: string; unavailableShort: string; invalid: string;
};

const en: PortalStrings = {
  brand: "Wedding invitation", footer: "A private invitation for you", privateInvitation: "Private invitation", checking: "Checking your private invitation…",
  unavailable: "This invitation link is not available. Please contact your hosts for help.", language: "Language",
  celebrationWith: "A celebration with", ourFamily: "Our family", welcome: (name) => `Welcome, ${name}.`,
  proxyNote: (names) => `This link also lets you respond for ${names}.`, onlyYours: "This private link shows only your invitations and responses.",
  notAvailableTitle: "Invitation details are not available", proxyAccess: "Responding on their behalf", yourInvitation: "Your invitation",
  invitations: (n) => `${n} ${n === 1 ? "invitation" : "invitations"}`, contactHosts: "Need to update who is invited or have a question? Please contact your hosts.",
  dateTbc: "Date to be confirmed", timeTbc: "Time to be confirmed", endsNextDay: "ends next day", dressCode: "Dress code", openMap: "Open map",
  confirmed: "Confirmed", tentative: "Timing may change",
  responseFor: (name) => `Your response for ${name}`, yes: "Yes, attending", no: "Can't attend", maybe: "Not sure yet",
  addNote: "Add a note for your hosts", noteLabel: "Note for your hosts (optional)",
  yesToAll: (name) => `Yes to all for ${name}`, saving: "Saving responses…", saveAll: "Save all responses",
  dietaryTitle: "Food and assistance", dietaryIntro: "Only your meal preference, allergies and assistance needs are shared with your hosts.",
  meal: "Meal preference", allergies: "Allergies", assistance: "Assistance needs", savingInfo: "Saving…", saveInfo: "Save information",
  replyEveryoneTitle: "Replying for everyone?", replyEveryoneButton: "Yes, everyone is coming to everything",
  replyEveryoneConfirm: (n) => `This saves “Yes, attending” for every invitation you can reply to, for ${n} ${n === 1 ? "person" : "people"}. You can change any answer afterwards.`,
  saveForEveryone: "Yes, save for everyone", cancel: "Cancel",
  yourPlan: "Your plan", items: (n) => `${n} ${n === 1 ? "item" : "items"}`, everyone: "Everyone", addToCalendar: "Add to calendar", map: "Map", timingTbc: "timing to be confirmed",
  stayAt: (place) => `Stay at ${place}`, until: (date) => `Until ${date}`, pickup: "Pickup", departureRide: "Departure ride", ride: "Ride",
  travelTitle: "Your confirmed travel arrangements", checkIn: (date, time) => `Check in ${date}${time ? ` from ${time}` : ""}`, checkOut: (date, time) => `check out ${date}${time ? ` by ${time}` : ""}`,
  arrivalTransfer: "Arrival transfer", departureTransfer: "Departure transfer", transfer: "Transfer", fromTo: (from, to) => `From ${from} to ${to}`,
  travelHelp: "If anything here looks wrong, please contact your hosts.",
  openInvitation: "Open your invitation", navInvitation: "Invitation", navPlan: "Plan", navReply: "Reply", navStory: "Our story", navFaq: "FAQ", navBlessings: "Blessings",
  countdownTitle: (name) => `Until ${name}`, days: (n) => `${n} ${n === 1 ? "day" : "days"}`, hours: (n) => `${n} ${n === 1 ? "hour" : "hours"}`, minutes: (n) => `${n} min`,
  liveNow: "Happening now", watchLive: "Watch live", ourStory: "Our story", faqTitle: "Good to know", palette: "Colour palette",
  blessingsTitle: "Blessings", blessingsIntro: "Leave a few words for the couple. They will read every message; approved ones appear here.",
  blessingPlaceholder: "Your wishes…", sendBlessing: "Send blessing", sendingBlessing: "Sending…",
  blessingThanks: "Thank you! Your blessing will appear once the couple has seen it.", blessingPending: (n) => `${n} of your ${n === 1 ? "blessing is" : "blessings are"} waiting for the couple.`,
  blessingLimit: "You've already sent the maximum number of blessings. Thank you!", noBlessingsYet: "Be the first to leave a blessing.",
  revealTitle: "You are cordially invited", infoTitle: "Guest information", navInfo: "Info", call: "Call", closingTitle: "With best compliments from", shareMoments: "Share your photos with",
  previewBanner: "Preview · replies are switched off", previewUntil: (time) => `This preview link works until ${time}.`, previewRsvpOff: "Guests reply here. Replies are switched off in this preview.", previewGuest: "Guest name",
  savedResponses: (n) => `${n} ${n === 1 ? "response" : "responses"} saved.`, alreadySaved: "These responses were already saved.", savedInfo: "Your information has been updated.",
  conflict: "This was changed a moment ago. Please refresh the page and try again.", unavailableShort: "This invitation is no longer available. Please contact your hosts.", invalid: "Please check your answers and try again.",
};

const hi: PortalStrings = {
  brand: "विवाह निमंत्रण", footer: "आपके लिए एक निजी निमंत्रण", privateInvitation: "निजी निमंत्रण", checking: "आपका निमंत्रण खोला जा रहा है…",
  unavailable: "यह निमंत्रण लिंक उपलब्ध नहीं है। कृपया अपने मेज़बानों से संपर्क करें।", language: "भाषा",
  celebrationWith: "उत्सव में आपका स्वागत है", ourFamily: "हमारा परिवार", welcome: (name) => `स्वागत है, ${name}।`,
  proxyNote: (names) => `इस लिंक से आप ${names} की ओर से भी उत्तर दे सकते हैं।`, onlyYours: "इस निजी लिंक पर केवल आपके निमंत्रण और उत्तर दिखते हैं।",
  notAvailableTitle: "निमंत्रण का विवरण उपलब्ध नहीं है", proxyAccess: "इनकी ओर से उत्तर", yourInvitation: "आपका निमंत्रण",
  invitations: (n) => `${n} निमंत्रण`, contactHosts: "किसी बदलाव या प्रश्न के लिए कृपया अपने मेज़बानों से संपर्क करें।",
  dateTbc: "तारीख़ तय होनी है", timeTbc: "समय तय होना है", endsNextDay: "अगले दिन समाप्त", dressCode: "पहनावा", openMap: "नक्शा खोलें",
  confirmed: "पक्का", tentative: "समय बदल सकता है",
  responseFor: (name) => `${name} के लिए आपका उत्तर`, yes: "हाँ, आऊँगा/आऊँगी", no: "नहीं आ पाऊँगा/पाऊँगी", maybe: "अभी पक्का नहीं",
  addNote: "मेज़बानों के लिए संदेश जोड़ें", noteLabel: "मेज़बानों के लिए संदेश (वैकल्पिक)",
  yesToAll: (name) => `${name} के लिए सभी में हाँ`, saving: "उत्तर सहेजे जा रहे हैं…", saveAll: "सभी उत्तर सहेजें",
  dietaryTitle: "भोजन और सहायता", dietaryIntro: "केवल आपकी भोजन पसंद, एलर्जी और सहायता की ज़रूरतें मेज़बानों के साथ साझा होती हैं।",
  meal: "भोजन पसंद", allergies: "एलर्जी", assistance: "सहायता की ज़रूरत", savingInfo: "सहेजा जा रहा है…", saveInfo: "जानकारी सहेजें",
  replyEveryoneTitle: "सबकी ओर से उत्तर देना है?", replyEveryoneButton: "हाँ, सभी सभी कार्यक्रमों में आएँगे",
  replyEveryoneConfirm: (n) => `इससे ${n} लोगों के हर निमंत्रण के लिए “हाँ” सहेजा जाएगा। आप बाद में कोई भी उत्तर बदल सकते हैं।`,
  saveForEveryone: "हाँ, सबके लिए सहेजें", cancel: "रद्द करें",
  yourPlan: "आपका कार्यक्रम", items: (n) => `${n}`, everyone: "सभी", addToCalendar: "कैलेंडर में जोड़ें", map: "नक्शा", timingTbc: "समय तय होना है",
  stayAt: (place) => `${place} में ठहराव`, until: (date) => `${date} तक`, pickup: "पिकअप", departureRide: "वापसी की गाड़ी", ride: "गाड़ी",
  travelTitle: "आपकी पक्की यात्रा व्यवस्था", checkIn: (date, time) => `चेक-इन ${date}${time ? `, ${time} से` : ""}`, checkOut: (date, time) => `चेक-आउट ${date}${time ? `, ${time} तक` : ""}`,
  arrivalTransfer: "आगमन पर गाड़ी", departureTransfer: "प्रस्थान पर गाड़ी", transfer: "गाड़ी", fromTo: (from, to) => `${from} से ${to} तक`,
  travelHelp: "यदि कुछ गलत लगे, तो कृपया अपने मेज़बानों से संपर्क करें।",
  openInvitation: "अपना निमंत्रण खोलें", navInvitation: "निमंत्रण", navPlan: "कार्यक्रम", navReply: "उत्तर", navStory: "हमारी कहानी", navFaq: "जानकारी", navBlessings: "आशीर्वाद",
  countdownTitle: (name) => `${name} में`, days: (n) => `${n} दिन`, hours: (n) => `${n} घंटे`, minutes: (n) => `${n} मिनट`,
  liveNow: "अभी चल रहा है", watchLive: "लाइव देखें", ourStory: "हमारी कहानी", faqTitle: "ज़रूरी जानकारी", palette: "रंगों की पसंद",
  blessingsTitle: "आशीर्वाद", blessingsIntro: "जोड़े के लिए कुछ शब्द लिखें। वे हर संदेश पढ़ेंगे; स्वीकृत संदेश यहाँ दिखेंगे।",
  blessingPlaceholder: "आपकी शुभकामनाएँ…", sendBlessing: "आशीर्वाद भेजें", sendingBlessing: "भेजा जा रहा है…",
  blessingThanks: "धन्यवाद! जोड़े के देखने के बाद आपका आशीर्वाद यहाँ दिखेगा।", blessingPending: (n) => `आपके ${n} आशीर्वाद जोड़े के देखने की प्रतीक्षा में हैं।`,
  blessingLimit: "आप अधिकतम आशीर्वाद भेज चुके हैं। धन्यवाद!", noBlessingsYet: "सबसे पहले आशीर्वाद दें।",
  revealTitle: "आप सादर आमंत्रित हैं", infoTitle: "अतिथि जानकारी", navInfo: "सूचना", call: "कॉल करें", closingTitle: "शुभेच्छु", shareMoments: "अपनी तस्वीरें साझा करें",
  previewBanner: "पूर्वावलोकन · उत्तर बंद हैं", previewUntil: (time) => `यह पूर्वावलोकन लिंक ${time} तक चलेगा।`, previewRsvpOff: "मेहमान यहाँ उत्तर देंगे। इस पूर्वावलोकन में उत्तर बंद हैं।", previewGuest: "अतिथि का नाम",
  savedResponses: (n) => `${n} उत्तर सहेजे गए।`, alreadySaved: "ये उत्तर पहले ही सहेजे जा चुके हैं।", savedInfo: "आपकी जानकारी अपडेट हो गई है।",
  conflict: "यह अभी-अभी बदला गया है। कृपया पेज रीफ़्रेश करके फिर कोशिश करें।", unavailableShort: "यह निमंत्रण अब उपलब्ध नहीं है। कृपया मेज़बानों से संपर्क करें।", invalid: "कृपया अपने उत्तर जाँचकर फिर कोशिश करें।",
};

const kn: PortalStrings = {
  brand: "ವಿವಾಹ ಆಹ್ವಾನ", footer: "ನಿಮಗಾಗಿ ಖಾಸಗಿ ಆಹ್ವಾನ", privateInvitation: "ಖಾಸಗಿ ಆಹ್ವಾನ", checking: "ನಿಮ್ಮ ಆಹ್ವಾನ ತೆರೆಯಲಾಗುತ್ತಿದೆ…",
  unavailable: "ಈ ಆಹ್ವಾನ ಲಿಂಕ್ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆತಿಥೇಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.", language: "ಭಾಷೆ",
  celebrationWith: "ಸಂಭ್ರಮಕ್ಕೆ ಸ್ವಾಗತ", ourFamily: "ನಮ್ಮ ಕುಟುಂಬ", welcome: (name) => `ಸ್ವಾಗತ, ${name}.`,
  proxyNote: (names) => `ಈ ಲಿಂಕ್ ಮೂಲಕ ನೀವು ${names} ಅವರ ಪರವಾಗಿಯೂ ಉತ್ತರಿಸಬಹುದು.`, onlyYours: "ಈ ಖಾಸಗಿ ಲಿಂಕ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಆಹ್ವಾನಗಳು ಮತ್ತು ಉತ್ತರಗಳು ಮಾತ್ರ ಕಾಣುತ್ತವೆ.",
  notAvailableTitle: "ಆಹ್ವಾನದ ವಿವರಗಳು ಲಭ್ಯವಿಲ್ಲ", proxyAccess: "ಅವರ ಪರವಾಗಿ ಉತ್ತರ", yourInvitation: "ನಿಮ್ಮ ಆಹ್ವಾನ",
  invitations: (n) => `${n} ಆಹ್ವಾನ`, contactHosts: "ಬದಲಾವಣೆ ಅಥವಾ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆತಿಥೇಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  dateTbc: "ದಿನಾಂಕ ನಿಗದಿಯಾಗಬೇಕಿದೆ", timeTbc: "ಸಮಯ ನಿಗದಿಯಾಗಬೇಕಿದೆ", endsNextDay: "ಮರುದಿನ ಮುಗಿಯುತ್ತದೆ", dressCode: "ಉಡುಗೆ", openMap: "ನಕ್ಷೆ ತೆರೆಯಿರಿ",
  confirmed: "ಖಚಿತ", tentative: "ಸಮಯ ಬದಲಾಗಬಹುದು",
  responseFor: (name) => `${name} ಗೆ ನಿಮ್ಮ ಉತ್ತರ`, yes: "ಹೌದು, ಬರುತ್ತೇನೆ", no: "ಬರಲಾಗುವುದಿಲ್ಲ", maybe: "ಇನ್ನೂ ಖಚಿತವಿಲ್ಲ",
  addNote: "ಆತಿಥೇಯರಿಗೆ ಸಂದೇಶ ಸೇರಿಸಿ", noteLabel: "ಆತಿಥೇಯರಿಗೆ ಸಂದೇಶ (ಐಚ್ಛಿಕ)",
  yesToAll: (name) => `${name} ಅವರಿಗೆ ಎಲ್ಲದಕ್ಕೂ ಹೌದು`, saving: "ಉತ್ತರಗಳನ್ನು ಉಳಿಸಲಾಗುತ್ತಿದೆ…", saveAll: "ಎಲ್ಲಾ ಉತ್ತರಗಳನ್ನು ಉಳಿಸಿ",
  dietaryTitle: "ಊಟ ಮತ್ತು ಸಹಾಯ", dietaryIntro: "ನಿಮ್ಮ ಊಟದ ಆಯ್ಕೆ, ಅಲರ್ಜಿ ಮತ್ತು ಸಹಾಯದ ಅಗತ್ಯಗಳನ್ನು ಮಾತ್ರ ಆತಿಥೇಯರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗುತ್ತದೆ.",
  meal: "ಊಟದ ಆಯ್ಕೆ", allergies: "ಅಲರ್ಜಿ", assistance: "ಸಹಾಯದ ಅಗತ್ಯ", savingInfo: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", saveInfo: "ಮಾಹಿತಿ ಉಳಿಸಿ",
  replyEveryoneTitle: "ಎಲ್ಲರ ಪರವಾಗಿ ಉತ್ತರಿಸುವಿರಾ?", replyEveryoneButton: "ಹೌದು, ಎಲ್ಲರೂ ಎಲ್ಲಾ ಸಮಾರಂಭಗಳಿಗೆ ಬರುತ್ತಾರೆ",
  replyEveryoneConfirm: (n) => `${n} ಜನರ ಪ್ರತಿಯೊಂದು ಆಹ್ವಾನಕ್ಕೂ “ಹೌದು” ಉಳಿಸಲಾಗುತ್ತದೆ. ನಂತರ ಯಾವುದೇ ಉತ್ತರವನ್ನು ಬದಲಿಸಬಹುದು.`,
  saveForEveryone: "ಹೌದು, ಎಲ್ಲರಿಗೂ ಉಳಿಸಿ", cancel: "ರದ್ದುಮಾಡಿ",
  yourPlan: "ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ", items: (n) => `${n}`, everyone: "ಎಲ್ಲರೂ", addToCalendar: "ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ", map: "ನಕ್ಷೆ", timingTbc: "ಸಮಯ ನಿಗದಿಯಾಗಬೇಕಿದೆ",
  stayAt: (place) => `${place} ನಲ್ಲಿ ವಾಸ್ತವ್ಯ`, until: (date) => `${date} ರವರೆಗೆ`, pickup: "ಕರೆದೊಯ್ಯುವಿಕೆ", departureRide: "ಹಿಂದಿರುಗುವ ವಾಹನ", ride: "ವಾಹನ",
  travelTitle: "ನಿಮ್ಮ ಖಚಿತ ಪ್ರಯಾಣ ವ್ಯವಸ್ಥೆ", checkIn: (date, time) => `ಚೆಕ್-ಇನ್ ${date}${time ? `, ${time} ರಿಂದ` : ""}`, checkOut: (date, time) => `ಚೆಕ್-ಔಟ್ ${date}${time ? `, ${time} ರೊಳಗೆ` : ""}`,
  arrivalTransfer: "ಆಗಮನದ ವಾಹನ", departureTransfer: "ನಿರ್ಗಮನದ ವಾಹನ", transfer: "ವಾಹನ", fromTo: (from, to) => `${from} ಇಂದ ${to} ಗೆ`,
  travelHelp: "ಏನಾದರೂ ತಪ್ಪಾಗಿದೆ ಎನಿಸಿದರೆ ದಯವಿಟ್ಟು ಆತಿಥೇಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  openInvitation: "ನಿಮ್ಮ ಆಹ್ವಾನ ತೆರೆಯಿರಿ", navInvitation: "ಆಹ್ವಾನ", navPlan: "ಕಾರ್ಯಕ್ರಮ", navReply: "ಉತ್ತರ", navStory: "ನಮ್ಮ ಕಥೆ", navFaq: "ಮಾಹಿತಿ", navBlessings: "ಆಶೀರ್ವಾದ",
  countdownTitle: (name) => `${name} ಗೆ ಇನ್ನು`, days: (n) => `${n} ದಿನ`, hours: (n) => `${n} ಗಂಟೆ`, minutes: (n) => `${n} ನಿಮಿಷ`,
  liveNow: "ಈಗ ನಡೆಯುತ್ತಿದೆ", watchLive: "ನೇರಪ್ರಸಾರ ನೋಡಿ", ourStory: "ನಮ್ಮ ಕಥೆ", faqTitle: "ತಿಳಿದಿರಬೇಕಾದದ್ದು", palette: "ಬಣ್ಣಗಳ ಆಯ್ಕೆ",
  blessingsTitle: "ಆಶೀರ್ವಾದಗಳು", blessingsIntro: "ದಂಪತಿಗಳಿಗೆ ಕೆಲವು ಮಾತುಗಳನ್ನು ಬರೆಯಿರಿ. ಅವರು ಪ್ರತಿ ಸಂದೇಶವನ್ನೂ ಓದುತ್ತಾರೆ; ಅನುಮೋದಿತವು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
  blessingPlaceholder: "ನಿಮ್ಮ ಶುಭಾಶಯಗಳು…", sendBlessing: "ಆಶೀರ್ವಾದ ಕಳುಹಿಸಿ", sendingBlessing: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
  blessingThanks: "ಧನ್ಯವಾದ! ದಂಪತಿಗಳು ನೋಡಿದ ನಂತರ ನಿಮ್ಮ ಆಶೀರ್ವಾದ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.", blessingPending: (n) => `ನಿಮ್ಮ ${n} ಆಶೀರ್ವಾದಗಳು ದಂಪತಿಗಳಿಗಾಗಿ ಕಾಯುತ್ತಿವೆ.`,
  blessingLimit: "ನೀವು ಗರಿಷ್ಠ ಆಶೀರ್ವಾದಗಳನ್ನು ಕಳುಹಿಸಿದ್ದೀರಿ. ಧನ್ಯವಾದ!", noBlessingsYet: "ಮೊದಲ ಆಶೀರ್ವಾದ ನಿಮ್ಮದಾಗಲಿ.",
  revealTitle: "ತಮಗೆ ಸಾದರ ಆಹ್ವಾನ", infoTitle: "ಅತಿಥಿಗಳಿಗೆ ಮಾಹಿತಿ", navInfo: "ಸೂಚನೆ", call: "ಕರೆ ಮಾಡಿ", closingTitle: "ಶುಭಾಕಾಂಕ್ಷಿಗಳು", shareMoments: "ನಿಮ್ಮ ಫೋಟೋಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ",
  previewBanner: "ಮುನ್ನೋಟ · ಉತ್ತರಗಳು ಸ್ಥಗಿತ", previewUntil: (time) => `ಈ ಮುನ್ನೋಟ ಲಿಂಕ್ ${time} ರವರೆಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.`, previewRsvpOff: "ಅತಿಥಿಗಳು ಇಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ. ಈ ಮುನ್ನೋಟದಲ್ಲಿ ಉತ್ತರಗಳು ಸ್ಥಗಿತ.", previewGuest: "ಅತಿಥಿಯ ಹೆಸರು",
  savedResponses: (n) => `${n} ಉತ್ತರಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ.`, alreadySaved: "ಈ ಉತ್ತರಗಳನ್ನು ಈಗಾಗಲೇ ಉಳಿಸಲಾಗಿದೆ.", savedInfo: "ನಿಮ್ಮ ಮಾಹಿತಿ ನವೀಕರಿಸಲಾಗಿದೆ.",
  conflict: "ಇದನ್ನು ಈಗಷ್ಟೇ ಬದಲಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಪುಟವನ್ನು ರಿಫ್ರೆಶ್ ಮಾಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", unavailableShort: "ಈ ಆಹ್ವಾನ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಆತಿಥೇಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.", invalid: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
};

const tcy: PortalStrings = {
  ...kn,
  brand: "ಮದಿಮೆದ ಲೆಪ್ಪು", footer: "ಈರೆಗಾದ್ ಖಾಸಗಿ ಲೆಪ್ಪು", privateInvitation: "ಖಾಸಗಿ ಲೆಪ್ಪು", checking: "ಈರೆನ ಲೆಪ್ಪು ತೆರೆಪುನೆ…",
  unavailable: "ಈ ಲೆಪ್ಪುದ ಲಿಂಕ್ ತಿಕ್ಕುಜಿ. ದಯಮಲ್ತ್ ಈರೆನ ಆತಿಥೇಯೆರೆನ್ ಸಂಪರ್ಕ ಮಲ್ಪುಲೆ.", language: "ಬಾಸೆ",
  celebrationWith: "ಸಂಭ್ರಮೊಗು ಸ್ವಾಗತ", ourFamily: "ಎಂಕುಲೆನ ಕುಟುಂಬ", welcome: (name) => `ಸ್ವಾಗತ, ${name}.`,
  proxyNote: (names) => `ಈ ಲಿಂಕ್‌ಡ್ ಈರ್ ${names} ನಕುಲೆನ ಪರವಾದ್‌ಲಾ ಉತ್ತರ ಕೊರೊಲಿ.`, onlyYours: "ಈ ಖಾಸಗಿ ಲಿಂಕ್‌ಡ್ ಈರೆನ ಲೆಪ್ಪು ಬೊಕ್ಕ ಉತ್ತರೊಲು ಮಾತ್ರ ತೋಜುಂಡು.",
  notAvailableTitle: "ಲೆಪ್ಪುದ ವಿವರೊಲು ತಿಕ್ಕುಜಿ", yourInvitation: "ಈರೆನ ಲೆಪ್ಪು",
  invitations: (n) => `${n} ಲೆಪ್ಪು`, contactHosts: "ಬದಲಾವಣೆ ಅತ್ತಂಡ ಪ್ರಶ್ನೆ ಇತ್ತ್ಂಡ ಆತಿಥೇಯೆರೆನ್ ಸಂಪರ್ಕ ಮಲ್ಪುಲೆ.",
  responseFor: (name) => `${name}ಗ್ ಈರೆನ ಉತ್ತರ`, yes: "ಅಂದ್, ಬರ್ಪೆ", no: "ಬರೊಲಿಯೆ", maybe: "ಇಂಚಿಪ ಗೊತ್ತಿಜ್ಜಿ",
  addNote: "ಆತಿಥೇಯೆರೆಗ್ ಸಂದೇಶ ಸೇರಾಲೆ", saveAll: "ಮಾತಾ ಉತ್ತರೊಲೆನ್ ದೀಲೆ", saving: "ಉತ್ತರೊಲೆನ್ ದೀಪುನೆ…",
  yesToAll: (name) => `${name}ಗ್ ಮಾತೆಡ್ಲಾ ಅಂದ್`,
  replyEveryoneTitle: "ಮಾತೆರೆನ ಪರವಾದ್ ಉತ್ತರ ಕೊರ್ಪರಾ?", replyEveryoneButton: "ಅಂದ್, ಮಾತೆರ್ಲಾ ಮಾತಾ ಕಾರ್ಯಕ್ರಮೊಗು ಬರ್ಪೆರ್",
  saveForEveryone: "ಅಂದ್, ಮಾತೆರೆಗ್ಲಾ ದೀಲೆ", cancel: "ಬೊಡ್ಚಿ",
  yourPlan: "ಈರೆನ ಕಾರ್ಯಕ್ರಮ", everyone: "ಮಾತೆರ್ಲಾ", addToCalendar: "ಕ್ಯಾಲೆಂಡರ್‌ಗ್ ಸೇರಾಲೆ",
  travelHelp: "ದಾಲ ತಪ್ಪು ತೋಜಿಂಡ ಆತಿಥೇಯೆರೆನ್ ಸಂಪರ್ಕ ಮಲ್ಪುಲೆ.",
  openInvitation: "ಈರೆನ ಲೆಪ್ಪು ತೆರಲೆ", navInvitation: "ಲೆಪ್ಪು", navStory: "ಎಂಕುಲೆನ ಕತೆ", ourStory: "ಎಂಕುಲೆನ ಕತೆ",
  blessingsTitle: "ಆಶೀರ್ವಾದೊಲು", sendBlessing: "ಆಶೀರ್ವಾದ ಕಡಪುಡ್ಲೆ", blessingPlaceholder: "ಈರೆನ ಶುಭಾಶಯೊಲು…",
  revealTitle: "ಈರೆಗ್ ಪ್ರೀತಿದ ಲೆಪ್ಪು", call: "ಫೋನ್ ಮಲ್ಪುಲೆ", previewGuest: "ಬಿನ್ನೆರೆನ ಪುದರ್",
};

export const PORTAL_STRINGS: Record<LanguageCode, PortalStrings> = { en, hi, kn, tcy };
export const PORTAL_LOCALES: Record<LanguageCode, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN", tcy: "kn-IN" };

/** Maps a server result to the guest's language (server actions answer in English). */
export function translateResult(t: PortalStrings, result: { message?: string; error?: string }): { message?: string; error?: string } {
  if (result.message) {
    const count = /^(\d+) response/.exec(result.message);
    if (count) return { message: t.savedResponses(Number(count[1])) };
    if (/already saved/i.test(result.message)) return { message: t.alreadySaved };
    if (/information has been updated/i.test(result.message)) return { message: t.savedInfo };
    return result;
  }
  if (result.error) {
    if (/changed|refresh/i.test(result.error)) return { error: t.conflict };
    if (/not available|no longer|contact your hosts/i.test(result.error)) return { error: t.unavailableShort };
    return { error: t.invalid };
  }
  return result;
}
