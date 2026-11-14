/**
 * Short reminder messages for families who haven't replied, in the household's language.
 * Hindi, Kannada and Tulu are drafts for native-speaker review, like the rest of the guest wording.
 */
import type { LanguageCode } from "@/lib/invitations/content";

type Reminder = { withLink: (name: string, couple: string, link: string) => string; useYourLink: (name: string, couple: string) => string };

export const REMINDERS: Record<LanguageCode, Reminder> = {
  en: {
    withLink: (name, couple, link) => `Dear ${name},\n\nA gentle reminder from ${couple}: please let us know if you can join us. It only takes a minute: ${link}`,
    useYourLink: (name, couple) => `Dear ${name},\n\nA gentle reminder from ${couple}: please let us know if you can join us. Use the invitation link we sent you earlier; it only takes a minute.`,
  },
  hi: {
    withLink: (name, couple, link) => `प्रिय ${name},\n\n${couple} की ओर से एक विनम्र स्मरण: कृपया बताएं कि क्या आप हमारे साथ शामिल हो सकेंगे। इसमें बस एक मिनट लगेगा: ${link}`,
    useYourLink: (name, couple) => `प्रिय ${name},\n\n${couple} की ओर से एक विनम्र स्मरण: कृपया बताएं कि क्या आप हमारे साथ शामिल हो सकेंगे। हमने पहले जो निमंत्रण लिंक भेजा था, उसी से उत्तर दें; इसमें बस एक मिनट लगेगा।`,
  },
  kn: {
    withLink: (name, couple, link) => `ಪ್ರಿಯ ${name},\n\n${couple} ಅವರಿಂದ ಒಂದು ಸ್ನೇಹಪೂರ್ವಕ ನೆನಪು: ನೀವು ನಮ್ಮೊಂದಿಗೆ ಸೇರಲು ಸಾಧ್ಯವೇ ಎಂದು ದಯವಿಟ್ಟು ತಿಳಿಸಿ. ಇದಕ್ಕೆ ಒಂದು ನಿಮಿಷ ಸಾಕು: ${link}`,
    useYourLink: (name, couple) => `ಪ್ರಿಯ ${name},\n\n${couple} ಅವರಿಂದ ಒಂದು ಸ್ನೇಹಪೂರ್ವಕ ನೆನಪು: ನೀವು ನಮ್ಮೊಂದಿಗೆ ಸೇರಲು ಸಾಧ್ಯವೇ ಎಂದು ದಯವಿಟ್ಟು ತಿಳಿಸಿ. ನಾವು ಮೊದಲು ಕಳುಹಿಸಿದ ಆಹ್ವಾನದ ಲಿಂಕ್ ಬಳಸಿ; ಒಂದು ನಿಮಿಷ ಸಾಕು.`,
  },
  tcy: {
    withLink: (name, couple, link) => `ಪ್ರೀತಿದ ${name},\n\n${couple} ನಕುಲೆಡ್ದ್ ಒಂಜಿ ನೆನಪು: ಈರ್ ಎಂಕುಲೆನೊಟ್ಟುಗು ಸೇರುವರ ಆಪುಂಡಾ ಪಂಡ್ದ್ ದಯಮಲ್ತ್ ತಿಳಿಪಾಲೆ. ಒಂಜಿ ನಿಮಿಷ ಸಾಕು: ${link}`,
    useYourLink: (name, couple) => `ಪ್ರೀತಿದ ${name},\n\n${couple} ನಕುಲೆಡ್ದ್ ಒಂಜಿ ನೆನಪು: ಈರ್ ಎಂಕುಲೆನೊಟ್ಟುಗು ಸೇರುವರ ಆಪುಂಡಾ ಪಂಡ್ದ್ ದಯಮಲ್ತ್ ತಿಳಿಪಾಲೆ. ಎಂಕುಲ್ ದುಂಬು ಕಡಪುಡಿನ ಲೆಪ್ಪುದ ಲಿಂಕ್ ಉಪಯೋಗ ಮಲ್ಪುಲೆ; ಒಂಜಿ ನಿಮಿಷ ಸಾಕು.`,
  },
};

export function reminderMessage(language: LanguageCode, values: { name: string; couple: string; link?: string }): string {
  const text = REMINDERS[language] ?? REMINDERS.en;
  return values.link ? text.withLink(values.name, values.couple, values.link) : text.useYourLink(values.name, values.couple);
}
