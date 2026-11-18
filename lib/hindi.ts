// Simple Hindi (Devanagari) wording, used when a guest writes in Hindi. Anything the admin has edited keeps the admin's wording.
export const HI_REPLIES: Record<string, string> = {
  greeting: "नमस्ते{name}! {resort} में आपका स्वागत है 🌿 मैं आपकी कैसे मदद कर सकता हूँ?",
  menu_body: "नीचे से कोई विकल्प चुनें, या सीधे अपना सवाल लिखें।",
  rooms_header: "{resort} के हमारे कमरे:",
  rooms_none: "हमारी टीम जल्द ही आपको कमरे और रेट बताएगी। आप अपनी तारीखें और मेहमानों की संख्या बता दें, मैं उन्हें आगे भेज दूँगा।",
  rooms_footer: "सीज़न के हिसाब से रेट बदल सकते हैं। अपनी तारीखें बताइए, मैं उपलब्धता पूछ लूँगा।",
  ask_dates: "आप किन तारीखों में रुकना चाहेंगे? (जैसे 20 दिसंबर से 23 दिसंबर)",
  ask_nights: "ठीक है — चेक-इन {check_in} को। आप कितनी रातें रुकेंगे (या चेक-आउट की तारीख बताइए)?",
  ask_guests: "कुल कितने मेहमान रुकेंगे (बड़े और बच्चे मिलाकर)?",
  ask_room: "आप कौन सा कमरा लेना चाहेंगे?",
  past_date: "यह तारीख निकल चुकी है। कृपया आने वाली तारीखें बताइए।",
  confirm_booking: "कृपया अपनी रिक्वेस्ट देख लीजिए:\n📅 {check_in} → {check_out} ({nights} रातें)\n👥 {guests} मेहमान\n🛏 {room}{estimate_line}\n\nक्या मैं इसे हमारी टीम को भेज दूँ?",
  booking_sent: "धन्यवाद! मैंने आपकी रिक्वेस्ट हमारी टीम को भेज दी है। वे उपलब्धता देखकर यहीं आपको बताएँगे।{hours_note}",
  booking_restart: "कोई बात नहीं — फिर से शुरू करते हैं। आप किन तारीखों में रुकना चाहेंगे?",
  yes_no_prompt: "कृपया हाँ या नहीं चुनें।",
  cancel_confirm: "क्या मैं बुकिंग {booking_id} ({check_in} → {check_out}) रद्द करने के लिए टीम से कहूँ?",
  cancel_sent: "ठीक है — मैंने टीम से कैंसिलेशन के लिए कह दिया है। वे यहीं पुष्टि करेंगे।{hours_note}",
  checkin_times: "चेक-इन {check_in_time} से और चेक-आउट {check_out_time} तक है। जल्दी चेक-इन या देर से चेक-आउट के लिए बस बताइए!",
  location_text: "हम यहाँ हैं: {address} 📍",
  photos_sent: "ये लीजिए! 📸",
  service_ack: "ठीक है! मैंने {service} के बारे में टीम से कह दिया है। वे यहीं आपसे बात करेंगे।{hours_note}",
  human: "बिल्कुल — मैंने हमारी टीम को बता दिया है। कोई जल्द ही यहाँ जवाब देगा।{hours_note}",
  complaint: "इसके लिए मुझे बहुत खेद है। मैंने तुरंत हमारी टीम को बता दिया है, कोई जल्द ही आपसे संपर्क करेगा।{hours_note}",
  thanks: "आपका स्वागत है! और कुछ मदद चाहिए?",
  bye: "ध्यान रखिए! कभी भी यहाँ मैसेज करें।",
  unknown: "माफ़ कीजिए, मैं ठीक से समझ नहीं पाया। मैं इनमें मदद कर सकता हूँ:",
  unknown_handoff: "मैं हमारी टीम के किसी सदस्य को बुलाता हूँ — वे जल्द ही यहाँ जवाब देंगे।{hours_note}",
};

export const MENU_EN = [
  { title: "Rooms & rates", description: "See our stays and prices" }, { title: "Check availability", description: "Share your dates" }, { title: "Photos", description: "See our rooms and property" },
  { title: "Location", description: "Directions and map" }, { title: "Check-in & out times", description: "Timings and policies" }, { title: "Talk to our team", description: "Chat with a person" },
];
export const MENU_HI = [
  { title: "कमरे और रेट", description: "हमारे कमरे और कीमतें" }, { title: "उपलब्धता देखें", description: "अपनी तारीखें बताएँ" }, { title: "फोटो", description: "कमरे और प्रॉपर्टी देखें" },
  { title: "लोकेशन", description: "रास्ता और मैप" }, { title: "चेक-इन / चेक-आउट", description: "समय और नियम" }, { title: "टीम से बात करें", description: "किसी व्यक्ति से बात" },
];
export const hasDevanagari = (t: string) => /[ऀ-ॿ]/.test(t);
