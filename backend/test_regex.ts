const reply = "Hey there! 😊 It seems like you're asking if I know your name...";
let cleaned = reply.replace(/^(hi|hello|hey|greetings)[^.!?\n]*[.!?]\s*/i, "");
cleaned = cleaned.replace(/^(nice to meet you|how can i assist you|how can i help)[^.!?\n]*[.!?]\s*/i, "");
cleaned = cleaned.replace(/^[\p{Emoji_Presentation}\s]+/u, "");
console.log("Original:", reply);
console.log("Cleaned:", cleaned);
