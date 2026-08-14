import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import CaseReminderCard from '../components/CaseReminderCard';
import CaseTrustCircleCard from '../components/CaseTrustCircleCard';
import FormattedChatMessage from '../components/FormattedChatMessage';
import SourceFusionBadge from '../components/SourceFusionBadge';
import { apiGetCase, apiDeleteCase, apiChat, apiUploadCaseFile, apiAnalyzeCase, getFileDownloadUrl, apiUpdateCaseTitle, apiSaveCaseChatHistory, apiSendEmailAlert, apiUpdateCaseCategory } from '../api/client';
import { useAuth } from '../context/AuthContext';

const CaseReport = () => {
  const { id: caseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleMarkCategoryInReport = async (newStatus, newSeverity) => {
    setCaseData((prev) => {
      if (!prev) return prev;
      const updatedFindings = { ...(prev.findings || {}) };
      if (newSeverity !== undefined) {
        updatedFindings.severity = newSeverity;
        updatedFindings.escalation_flag = newSeverity;
      }
      return {
        ...prev,
        status: newStatus !== undefined ? newStatus : prev.status,
        findings: updatedFindings,
      };
    });

    try {
      await apiUpdateCaseCategory(caseId, { status: newStatus, severity: newSeverity });
    } catch (err) {
      console.error('Failed to update case category:', err);
    }
  };

  // Chat & Attachments State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatFiles, setChatFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileTab, setMobileTab] = useState('chat'); // 'chat' or 'insights' on mobile
  const [customSuggestedPrompts, setCustomSuggestedPrompts] = useState(null);
  const [completedReminders, setCompletedReminders] = useState({});

  // Collapsible Side Panel Cards State (default collapsed on load)
  const [collapsedCards, setCollapsedCards] = useState({
    insights: true,
    evidence: true,
    concepts: true,
    actionPlan: true,
    audit: true,
    reminders: true,
    trustCircle: false,
  });
  const toggleCardCollapse = (cardId) => {
    setCollapsedCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }));
  };

  // Editable Chat Title State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Voice Recording state in chat bar
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset custom prompts on language change so prompt chips update to active language
  useEffect(() => {
    setCustomSuggestedPrompts(null);
  }, [i18n.language]);

  // --- Dynamic Suggested Prompts (predicted by AI or context-based) ---
  const suggestedPrompts = useMemo(() => {
    const currentLang = i18n.language?.split('-')[0] || 'en';

    if (Array.isArray(customSuggestedPrompts) && customSuggestedPrompts.length >= 3) {
      return customSuggestedPrompts.slice(0, 3);
    }

    const PROMPT_DICTS = {
      en: [
        "What are the main risk factors in my document?",
        "Explain key medical / technical terms simply",
        "What step-by-step precautions should I take?"
      ],
      hi: [
        "मेरे दस्तावेज़ में मुख्य जोखिम कारक क्या हैं?",
        "मुख्य शब्दों को सरलता से समझाइए",
        "मुझे क्या सावधानियां बरतनी चाहिए?"
      ],
      te: [
        "నా డాక్యుమెంట్‌లోని ప్రధాన ప్రమాదకర అంశాలు ఏమిటి?",
        "కీలకమైన పదాలను సరళంగా వివరించండి",
        "నేను ఏ జాగ్రత్తలు తీసుకోవాలి?"
      ],
      ta: [
        "எனது ஆவணத்தில் உள்ள முக்கிய ஆபத்து காரணி என்ன?",
        "முக்கிய சொற்களை எளிமையாக விளக்கவும்",
        "நான் என்ன முன்னెச்சரிக்கை நடவடிக்கைகளை எடுக்க வேண்டும்?"
      ],
      kn: [
        "ನನ್ನ ದಾಖಲೆಯಲ್ಲಿರುವ ಮುಖ್ಯ ಅಪಾಯದ ಅಂಶಗಳು ಯಾವುವು?",
        "ಮುಖ್ಯ ಪದಗಳನ್ನು ಸರಳವಾಗಿ ವಿವರಿಸಿ",
        "ನಾನು ಯಾವ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಕು?"
      ]
    };

    if (caseData?.department === 'fraud') {
      const FRAUD_PROMPT_DICTS = {
        en: [
          "How can I tell if this document or invoice is authentic?",
          "What specific red flags make this suspicious?",
          "What step-by-step security precautions should I take?"
        ],
        hi: [
          "मैं कैसे बता सकता हूं कि यह दस्तावेज असली है या फर्जी?",
          "इस संदेश में क्या संदिग्ध लाल झंडे हैं?",
          "मुझे क्या सुरक्षा सावधानियां बरतनी चाहिए?"
        ],
        te: [
          "ఈ డాక్యుమెంట్ అసలైనదో కాదో నేను ఎలా తెలుసుకోవచ్చు?",
          "ఇందులో అనుమానాస్పదమైన అంశాలు ఏమిటి?",
          "నేను ఏ భద్రతా జాగ్రత్తలు తీసుకోవాలి?"
        ],
        ta: [
          "இந்த ஆவணம் உண்மையானதா என்பதை நான் எவ்வாறு கண்டறிவது?",
          "இதில் உள்ள சந்தேகத்திற்குரிய விவரங்கள் யாவை?",
          "நான் என்ன பாதுகாப்பு முன்னெச்சரிக்கை நடவடிக்கைகளை எடுக்க வேண்டும்?"
        ],
        kn: [
          "ಈ ದಾಖಲೆ ನಿಜವಾದದ್ದೇ ಎಂದು ನಾನು ಹೇಗೆ ತಿಳಿಯುವುದು?",
          "ಇದರಲ್ಲಿ ಸಂಶಯಾಸ್ಪದ ಅಂಶಗಳು ಯಾವುವು?",
          "ನಾನು ಯಾವ ಭದ್ರತಾ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಕು?"
        ]
      };
      return FRAUD_PROMPT_DICTS[currentLang] || FRAUD_PROMPT_DICTS.en;
    }

    const DEFAULT_PROMPTS = PROMPT_DICTS[currentLang] || PROMPT_DICTS.en;

    const lastMsg = [...messages].reverse().find((m) => m.sender === 'ai' || m.sender === 'user');
    if (!lastMsg?.text) return DEFAULT_PROMPTS;

    const textLower = lastMsg.text.toLowerCase();

    const TOPIC_PROMPTS = {
      fever: {
        en: ['Is my fever serious enough to visit a doctor?', 'What OTC medicines help reduce fever safely?', 'What warning signs should I watch for with fever?'],
        hi: ['क्या मेरा बुखार डॉक्टर के पास जाने जितना गंभीर है?', 'कौन सी दवाएं बुखार को सुरक्षित रूप से कम करती हैं?', 'बुखार के साथ किन चेतावनी संकेतों पर ध्यान देना चाहिए?'],
        te: ['నా జ్వరం డాక్టర్‌ను సందర్శించేంత తీవ్రంగా ఉందా?', 'జ్వరాన్ని తగ్గించే సురక్షితమైన మందులు ఏమిటి?', 'జ్వరంతో పాటు ఏ హెచ్చరిక సంకేతాలను గమనించాలి?'],
        ta: ['எனது காய்ச்சல் மருத்துவரைப் பார்க்க போதுமான அளவு தீவிரமானதா?', 'காய்ச்சலைக் குறைக்க பாதுகாப்பான மருந்துகள் யாவை?', 'காய்ச்சலுடன் எந்த எச்சரிக்கை அறிகுறிகளைக் கவனிக்க வேண்டும்?'],
        kn: ['ನನ್ನ ಜ್ವರ ವೈದ್ಯರನ್ನು ಭೇಟಿಯಾಗುವಷ್ಟು ತೀವ್ರವಾಗಿದೆಯೇ?', 'ಜ್ವರವನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಕಡಿಮೆ ಮಾಡುವ ಔಷಧಗಳು ಯಾವುವು?', 'ಜ್ವರದೊಂದಿಗೆ ಯಾವ ಎಚ್ಚರಿಕೆ ಚಿಹ್ನೆಗಳನ್ನು ಗಮನಿಸಬೇಕು?']
      },
      skin: {
        en: ['What could be causing this skin condition?', 'Are there creams or treatments I can try at home?', 'When should I see a dermatologist?'],
        hi: ['त्वचा की इस स्थिति का कारण क्या हो सकता है?', 'क्या कोई क्रीम या उपचार है जो मैं घर पर कर सकता हूं?', 'मुझे त्वचा विशेषज्ञ से कब मिलना चाहिए?'],
        te: ['ఈ చర్మ వ్యాధికి కారణం ఏమి కావచ్చు?', 'నేను ఇంట్లో ప్రయత్నించగల క్రీములు లేదా చికిత్సలు ఉన్నాయా?', 'నేను డెర్మటాలజిస్ట్‌ను ఎప్పుడు సంప్రదించాలి?'],
        ta: ['இந்த தோல் நோய்க்கு என்ன காரணம்?', 'வீட்டில் நான் செய்யக்கூடிய சிகிச்சைகள் ஏதேனும் உள்ளதா?', 'நான் எப்போது தோல் மருத்துவரைப் பார்க்க வேண்டும்?'],
        kn: ['ಈ ಚರ್ಮದ ಸ್ಥಿತಿಗೆ ಕಾರಣವೇನಿರಬಹುದು?', 'ಮನೆಯಲ್ಲಿ ನಾನು ಪ್ರಯತ್ನಿಸಬಹುದಾದ ಚಿಕಿತ್ಸೆಗಳಿವೆಯೇ?', 'ನಾನು ಚರ್ಮದ ವೈದ್ಯರನ್ನು ಯಾವಾಗ ಭೇಟಿಯಾಗಬೇಕು?']
      },
      medication: {
        en: ['Are there any side effects I should know about?', 'Can I take this with other medications?', 'How long should I continue this treatment?'],
        hi: ['क्या मुझे कोई दुष्प्रभाव जानने चाहिए?', 'क्या मैं इसे अन्य दवाओं के साथ ले सकता हूं?', 'मुझे यह उपचार कब तक जारी रखना चाहिए?'],
        te: ['నేను తెలుసుకోవాల్సిన దుష్ప్రభావాలు ఏమైనా ఉన్నాయా?', 'నేను దీనిని ఇతర మందులతో తీసుకోవచ్చా?', 'నేను ఎంతకాలం ఈ చికిత్సను కొనసాగించాలి?'],
        ta: ['நான் தெரிந்து கொள்ள வேண்டிய பக்க விளைவுகள் ஏதேனும் உள்ளதா?', 'இதை மற்ற மருந்துகளுடன் நான் எடுத்துக் கொள்ளலாமா?', 'இந்த சிகிச்சையை நான் எவ்வளவு காலம் தொடர வேண்டும்?'],
        kn: ['ನಾನು ತಿಳಿದುಕೊಳ್ಳಬೇಕಾದ ಯಾವುದೇ ಅಡ್ಡಪರಿಣಾಮಗಳಿವೆಯೇ?', 'ಇದನ್ನು ಇತರ ಔಷಧಿಗಳೊಂದಿಗೆ ತೆಗೆದುಕೊಳ್ಳಬಹುದೇ?', 'ನಾನು ಎಷ್ಟು ಕಾಲ ಈ ಚಿಕಿತ್ಸೆಯನ್ನು ಮುಂದುವರಿಸಬೇಕು?']
      },
      phishing: {
        en: ['How do I report this fraud to authorities?', 'What information might have been compromised?', 'How do I secure my accounts immediately?'],
        hi: ['मैं अधिकारियों को इस धोखाधड़ी की रिपोर्ट कैसे करूं?', 'कौन सी जानकारी से समझौता हुआ हो सकता है?', 'मैं तुरंत अपने खातों को सुरक्षित कैसे करूं?'],
        te: ['నేను అధికారులకు ఈ మోసాన్ని ఎలా రిపోర్ట్ చేయాలి?', 'ఏ సమాచారం రాజీపడి ఉండవచ్చు?', 'నేను వెంటనే నా ఖాతాలను ఎలా భద్రపరచాలి?'],
        ta: ['இந்த மோசடியை அதிகாரிகளுக்கு எவ்வாறு புகாரளிப்பது?', 'எந்தத் தகவல் திருடப்பட்டிருக்கலாம்?', 'எனது கணக்குகளை உடனடியாக எவ்வாறு பாதுகாப்பது?'],
        kn: ['ಈ ವಂಚನೆಯನ್ನು ಅಧಿಕಾರಿಗಳಿಗೆ ವರದಿ ಮಾಡುವುದು ಹೇಗೆ?', 'ಯಾವ ಮಾಹಿತಿ ಸೋರಿಕೆಯಾಗಿರಬಹುದು?', 'ನನ್ನ ಖಾತೆಗಳನ್ನು ತಕ್ಷಣವೇ ಸುರಕ್ಷಿತಗೊಳಿಸುವುದು ಹೇಗೆ?']
      }
    };

    if (textLower.includes('fever') || textLower.includes('temperature') || textLower.includes('chills') || textLower.includes('జ్వరం') || textLower.includes('बुखार')) {
      return TOPIC_PROMPTS.fever[currentLang] || TOPIC_PROMPTS.fever.en;
    }
    if (textLower.includes('rash') || textLower.includes('skin') || textLower.includes('psoriasis') || textLower.includes('lesion') || textLower.includes('itch') || textLower.includes('సోరియాసిస్') || textLower.includes('त्वचा')) {
      return TOPIC_PROMPTS.skin[currentLang] || TOPIC_PROMPTS.skin.en;
    }
    if (textLower.includes('medication') || textLower.includes('medicine') || textLower.includes('drug') || textLower.includes('prescription') || textLower.includes('మందులు') || textLower.includes('दवा')) {
      return TOPIC_PROMPTS.medication[currentLang] || TOPIC_PROMPTS.medication.en;
    }
    if (textLower.includes('phishing') || textLower.includes('fraud') || textLower.includes('scam') || textLower.includes('suspicious') || textLower.includes('మోసం')) {
      return TOPIC_PROMPTS.phishing[currentLang] || TOPIC_PROMPTS.phishing.en;
    }

    return DEFAULT_PROMPTS;
  }, [customSuggestedPrompts, messages, i18n.language]);


  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Fetch Case Data & Initialize Chat History
  const fetchCase = async () => {
    setLoading(true);
    setError(null);
    let data = null;
    try {
      const res = await apiGetCase(caseId);
      data = res.data;
    } catch (err) {
      const local = JSON.parse(localStorage.getItem('sumscale_local_cases') || '[]');
      data = local.find(l => (l._id || l.id) === caseId);
      if (!data && caseId.startsWith('demo_case_')) {
        data = {
          _id: caseId,
          id: caseId,
          department: 'health',
          description: 'Document analysis case.',
          status: 'completed',
          created_at: new Date().toISOString(),
          evidence: [{ file_id: 'f_1', original_name: 'document.pdf', file_type: 'pdf', extracted_text: 'Sample document text' }],
          findings: {
            summary: 'Document analysis completed. Model ready for questions.',
            severity: 'low',
            escalation_flag: 'low',
            remediation_checklist: ['Review key findings', 'Ask questions to copilot'],
          },
        };
      }
    }

    if (!data) {
      setError('Document case not found.');
      setLoading(false);
      return;
    }

    setCaseData(data);

    // 1. Priority check: DB chat_history returned from API backend
    if (Array.isArray(data.chat_history) && data.chat_history.length > 0) {
      setMessages(data.chat_history);
      localStorage.setItem(`sumscale_case_chat_${caseId}`, JSON.stringify(data.chat_history));
      setLoading(false);
      return;
    }

    // 2. Secondary check: localStorage persistent chat history
    const storageKey = `sumscale_case_chat_${caseId}`;
    const altStorageKey = `sumscale_case_chat_${data._id || data.id}`;
    const savedChat = localStorage.getItem(storageKey) || localStorage.getItem(altStorageKey);

    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          // Sync existing localStorage messages to MongoDB
          const targetId = data._id || data.id || caseId;
          apiSaveCaseChatHistory(targetId, parsed).catch(() => {});
          setLoading(false);
          return;
        }
      } catch {
        // fallback to initial message
      }
    }

    const findings = data.findings || {};
    const initialSummary = findings.summary || findings.pattern_classification || 'Your uploaded records have been processed.';
    const remediation = findings.remediation_checklist || [];
    const escalationFlag = findings.escalation_flag || findings.severity;

    let welcomeText = `Hi there! I've carefully reviewed your uploaded records for Case **#${caseId.slice(-6)}**.\n\n` +
      `**Overview:**\n${initialSummary}\n\n`;

    if (remediation.length > 0) {
      welcomeText += `**Recommended Next Steps:**\n` + remediation.map((item, i) => `• ${item}`).join('\n') + `\n\n`;
    }

    if (escalationFlag === 'high') {
      welcomeText += `🚨 **Important Notice:** Because high-risk or fever findings were noted, I recommend reaching out to a doctor or specialist for a personal check-up.\n\n`;
    }

    welcomeText += `What questions or concerns can I help you explore next?`;

    const initialMsgs = [{ sender: 'ai', text: welcomeText, timestamp: new Date().toISOString() }];
    setMessages(initialMsgs);
    localStorage.setItem(storageKey, JSON.stringify(initialMsgs));
    const targetId = data._id || data.id || caseId;
    apiSaveCaseChatHistory(targetId, initialMsgs).catch(() => {});
    setLoading(false);
  };

  useEffect(() => {
    fetchCase();
  }, [caseId]);

  // Save messages to both localStorage and MongoDB database
  const updateMessages = (newMsgs) => {
    setMessages(newMsgs);
    localStorage.setItem(`sumscale_case_chat_${caseId}`, JSON.stringify(newMsgs));
    const targetId = caseData?._id || caseData?.id || caseId;
    if (targetId) {
      apiSaveCaseChatHistory(targetId, newMsgs).catch((e) => console.warn('Failed to sync chat history to DB:', e));
    }
  };

  // Handle file selection inside chat bar
  const handleChatFileSelect = (e) => {
    const newFiles = Array.from(e.target.files);
    e.target.value = '';
    if (newFiles.length === 0) return;

    newFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const withPreview = new File([file], file.name, { type: file.type });
          withPreview.previewUrl = ev.target.result;
          setChatFiles((prev) => [...prev, withPreview]);
        };
        reader.readAsDataURL(file);
      } else {
        setChatFiles((prev) => [...prev, file]);
      }
    });
  };

  const removeChatFile = (idx) => {
    setChatFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Send message to RAG Chatbot with optional file uploads & voice queries
  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend || inputMessage).trim();
    if (!text && chatFiles.length === 0) return;
    if (sending) return;

    const currentFiles = [...chatFiles];
    setChatFiles([]);
    if (!textToSend) setInputMessage('');
    setSending(true);

    let uploadedNames = [];
    let hasVoiceNote = false;

    try {
      // 1. Upload any attached files or voice notes to case
      for (const file of currentFiles) {
        try {
          await apiUploadCaseFile(caseId, file);
          uploadedNames.push(file.name);
          if (file.type.startsWith('audio') || file.name.includes('voice_note')) {
            hasVoiceNote = true;
          }
        } catch (uploadErr) {
          console.warn(`Upload failed for ${file.name}:`, uploadErr.message);
          // Non-fatal: continue sending the message even if individual upload fails
        }
      }

      // 1b. Immediately refresh caseData so side panel 'UPLOADED EVIDENCE' updates in real-time
      if (uploadedNames.length > 0) {
        try {
          const refreshed = await apiGetCase(caseId);
          setCaseData(refreshed.data);
        } catch (refErr) {
          console.warn('Failed to refresh case evidence list:', refErr);
        }
      }

      // 2. Format user message prompt (include file context in the query)
      let userPrompt = text;
      const imageAttachments = currentFiles
        .filter((f) => f.type?.startsWith('image/'))
        .map((f) => ({ name: f.name, previewUrl: f.previewUrl || null }));
      const otherAttachmentNames = currentFiles
        .filter((f) => !f.type?.startsWith('image/'))
        .map((f) => f.name);

      if (!userPrompt && hasVoiceNote) {
        userPrompt = `🎙️ [Voice Note Recorded]: Please review my voice note and health records and share your advice.`;
      } else if (uploadedNames.length > 0) {
        const allNames = uploadedNames.join(', ');
        userPrompt = userPrompt
          ? `${userPrompt}\n\n[Attached Files: ${allNames}]`
          : `I've attached the following file(s) for your review: ${allNames}. Based on my case history, what insights can you share?`;
      }

      const userMsg = {
        sender: 'user',
        text: userPrompt,
        imageAttachments,
        otherAttachments: otherAttachmentNames,
        timestamp: new Date().toISOString(),
      };
      const updatedMsgs = [...messages, userMsg];
      updateMessages(updatedMsgs);

      // 3. Query RAG Chatbot with user's selected language and full conversation history
      const lang = i18n.language ? i18n.language.split('-')[0] : (caseData?.language || 'en');

      // Send clean chat history — strip blobs/attachments to keep payload lean
      // Keep last 16 messages (8 turns) for full multi-turn memory like Claude/GPT
      const cleanHistory = updatedMsgs.slice(-16).map((m) => ({
        sender: m.sender,
        text: (m.text || '').slice(0, 800), // cap per message to avoid token overflow
        timestamp: m.timestamp,
      }));

      const res = await apiChat(userPrompt, lang, cleanHistory, caseId);
      let aiResponseText = res.data?.answer;
      const returnedNextQuestions = res.data?.suggested_next_questions;
      const autoTitle = res.data?.auto_generated_title;

      if (Array.isArray(returnedNextQuestions) && returnedNextQuestions.length >= 3) {
        setCustomSuggestedPrompts(returnedNextQuestions);
      }

      // Auto-dispatch email alert if user asks for email in chat
      const lowerPrompt = userPrompt.toLowerCase();
      if (lowerPrompt.includes('email') || lowerPrompt.includes('mail')) {
        try {
          const findings = caseData?.findings || {};
          await apiSendEmailAlert({
            title: caseData?.title || 'Case Update',
            summary: findings.summary || findings.pattern_classification || 'Document Analysis Summary',
            checklist: findings.remediation_checklist || [],
            recipient_email: user?.email,
          });
        } catch (emailErr) {
          console.warn('Failed to send auto email from chat:', emailErr);
        }
      }

      // Auto update chat title after first 2 messages if title isn't custom set yet
      if (autoTitle && (!caseData?.title || updatedMsgs.length >= 2)) {
        try {
          await apiUpdateCaseTitle(caseId, autoTitle);
          setCaseData((prev) => ({ ...prev, title: autoTitle }));
        } catch (titleErr) {
          console.warn('Failed to auto update case title:', titleErr);
        }
      }

      // Only override if answer is genuinely empty or is the old voice-note placeholder
      if (!aiResponseText || aiResponseText.includes('cannot analyze your voice query directly')) {
        const findings = caseData?.findings || {};
        const isFraud = caseData?.department === 'fraud';
        const summary = findings.summary || findings.pattern_classification || (isFraud ? 'your uploaded security documents' : 'your uploaded records');
        const remediation = findings.remediation_checklist || [];

        const closingLine = isFraud
          ? `Please let me know if you have any questions about verifying this communication or staying safe online!`
          : `Please let me know if there's anything specific you'd like me to explain further!`;

        aiResponseText =
          `I took a close look at your records. ${summary}\n\n` +
          (remediation.length > 0
            ? `Here is what I recommend keeping in mind:\n` + remediation.map((r) => `• ${r}`).join('\n') + `\n\n`
            : '') +
          closingLine;
      }

      const citedCases = res.data?.cited_cases || [];
      const aiMsg = {
        sender: 'ai',
        text: aiResponseText,
        cited: citedCases,
        timestamp: new Date().toISOString(),
      };
      updateMessages([...updatedMsgs, aiMsg]);
    } catch (err) {
      const errMsg = err?.response?.data?.detail || err?.message || '';
      const isTimeout = errMsg.includes('timeout') || errMsg.includes('ECONNABORTED') || err?.code === 'ECONNABORTED';
      const isRateLimit = errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('quota');

      let errorText;
      if (isTimeout) {
        errorText = `⏱️ The request is taking longer than expected — this usually happens on Render's free tier when the server is waking up. Please try sending your message again.`;
      } else if (isRateLimit) {
        errorText = `⚡ Briefly rate-limited. Please wait 30 seconds and try again — the AI will be ready!`;
      } else {
        errorText = `❌ Something went wrong connecting to the AI. Check your internet connection and try again.`;
      }

      const errorAiMsg = {
        sender: 'ai',
        text: errorText,
        isError: true,
        retryMessage: userPrompt, // stored so user can click retry
        timestamp: new Date().toISOString(),
      };
      updateMessages([...updatedMsgs, errorAiMsg]);
    } finally {
      setSending(false);
    }
  };


  const currentAudioRef = useRef(null);

  const stopAllSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setSpeakingIdx(null);
  };

  // TTS Voice Output with Native Multilingual Audio Engine
  const handleSpeech = (text, idx) => {
    if (speakingIdx === idx) {
      stopAllSpeech();
      return;
    }

    stopAllSpeech();

    // Clean text for speech — remove Markdown, code blocks, and source citations
    let cleanText = text
      .split('Sources Cited:')[0]
      .split('ఆధారాలు:')[0]
      .split('उद्धृत स्रोत:')[0]
      .split('ஆதாரங்கள்:')[0]
      .split('ಆಧಾರಗಳು:')[0]
      .replace(/[*#_`]/g, '')
      .trim();

    if (!cleanText) return;

    const currentLang = i18n.language?.split('-')[0] || 'en';

    // Helper: Play Backend TTS MP3 stream (works 100% reliably for all Indian languages & browsers)
    const playBackendTTS = (phrase) => {
      const shortPhrase = phrase.slice(0, 300);
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const url = `${apiBase}/chat/tts?text=${encodeURIComponent(shortPhrase)}&lang=${currentLang}`;
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        setSpeakingIdx(null);
        currentAudioRef.current = null;
      };
      audio.onerror = () => {
        // Fallback to browser WebSpeech API if backend TTS has network issue
        if ('speechSynthesis' in window) {
          const langMap = { en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN' };
          const utterance = new SpeechSynthesisUtterance(shortPhrase);
          utterance.lang = langMap[currentLang] || 'en-US';
          utterance.onend = () => setSpeakingIdx(null);
          utterance.onerror = () => setSpeakingIdx(null);
          window.speechSynthesis.speak(utterance);
        } else {
          setSpeakingIdx(null);
          currentAudioRef.current = null;
        }
      };
      audio.play().catch(() => {
        // Fallback to browser WebSpeech API on auto-play prevention
        if ('speechSynthesis' in window) {
          const langMap = { en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN' };
          const utterance = new SpeechSynthesisUtterance(shortPhrase);
          utterance.lang = langMap[currentLang] || 'en-US';
          utterance.onend = () => setSpeakingIdx(null);
          utterance.onerror = () => setSpeakingIdx(null);
          window.speechSynthesis.speak(utterance);
        } else {
          setSpeakingIdx(null);
        }
      });
      setSpeakingIdx(idx);
    };

    playBackendTTS(cleanText);
  };

  // Voice Note Recording & Speech-to-Text Setup
  const startRecording = async () => {
    // 1. Clean non-repeating Web Speech API setup with selected Indian language
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        const langMap = { en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN' };
        const currentLang = i18n.language?.split('-')[0] || 'en';
        recognition.lang = langMap[currentLang] || 'en-US';

        recognition.onresult = (e) => {
          if (e.results.length > 0 && e.results[0][0]) {
            const transcript = e.results[0][0].transcript.trim();
            if (transcript) {
              setInputMessage((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
            }
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        // Fallback silently
      }
    }

    // 2. Record audio blob to upload as a voice note file attachment
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('wav') ? 'wav' : 'webm';
        const recordedFile = new File([new Blob(audioChunksRef.current, { type: mimeType })], `voice_note_${Date.now()}.${ext}`, { type: mimeType });
        setChatFiles((prev) => [...prev, recordedFile]);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => setRecordingSeconds((sec) => sec + 1), 1000);
    } catch {
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  // Export Chat & Document Summary to Text File
  const handleExport = () => {
    if (!caseData) return;
    const findings = caseData.findings || {};
    let content = `====================================================\n`;
    content += `OMNIAID / SUMSCALE DOCUMENT ANALYSIS & CHAT REPORT\n`;
    content += `====================================================\n`;
    content += `Case ID: ${caseId}\n`;
    content += `Date: ${new Date(caseData.created_at || Date.now()).toLocaleString()}\n`;
    content += `Severity: ${(findings.escalation_flag || findings.severity || 'LOW').toUpperCase()}\n`;
    content += `Summary: ${findings.summary || 'N/A'}\n\n`;
    content += `----------------------------------------------------\n`;
    content += `CONVERSATION HISTORY:\n`;
    content += `----------------------------------------------------\n`;
    messages.forEach((m) => {
      content += `[${m.sender === 'user' ? 'USER' : 'AI COPILOT'} - ${new Date(m.timestamp).toLocaleTimeString()}]\n`;
      content += `${m.text}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Document_Analysis_Report_${caseId.slice(-6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save Custom Chat Title to Database
  const handleSaveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed) {
      setIsEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await apiUpdateCaseTitle(caseId, trimmed);
      setCaseData((prev) => ({ ...prev, title: res.data.title }));
      setIsEditingTitle(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update title.');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this document analysis case?')) return;
    setDeleting(true);
    try {
      await apiDeleteCase(caseId);
      localStorage.removeItem(`sumscale_case_chat_${caseId}`);
      navigate('/dashboard');
    } catch (err) {
      setDeleting(false);
      alert(err.response?.data?.detail || 'Failed to delete case.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-bg">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-full border border-[#83C5BE]/50 shadow-md">
            <div className="w-4 h-4 rounded-full border-2 border-[#006D77] border-t-transparent animate-spin" />
            <span className="text-xs font-bold text-[#006D77]">Loading Document Chat Session...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-bg">
        <Navbar />
        <div className="flex-1 max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-700 text-xs font-semibold">
            {error || 'Document case not found.'}
          </div>
          <Link to="/dashboard" className="inline-block text-xs font-bold text-[#006D77] hover:underline">
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const findings = caseData.findings || {};
  const flag = findings.escalation_flag || findings.severity || 'low';
  const allEvidence = caseData.evidence || [];
  const evidenceList = allEvidence.filter((file) => {
    const filename = (file.original_name || file.file_id || '').toLowerCase();
    const isVoiceNote = filename.startsWith('voice_note_') || filename.includes('voice_note') || filename === 'user_description.txt';
    return !isVoiceNote;
  });
  const remediationList = findings.remediation_checklist || [];
  const displayTitle = caseData.title || evidenceList[0]?.original_name || `Case #${caseId.slice(-6)}`;

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-bg">
      <Navbar />

      {/* Main Screen Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col space-y-4">

        {/* ── Desktop Top Header & Actions Bar (Visible on lg screens) ── */}
        <div className="hidden lg:flex bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm p-5 items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Link to="/dashboard" className="text-xs font-extrabold text-[#006D77] hover:underline flex items-center space-x-1">
              <span>← Back</span>
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <div className="flex items-center space-x-2">
                {/* Editable Title Bar */}
                {isEditingTitle ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveTitle();
                    }}
                    className="flex items-center space-x-1.5"
                  >
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      autoFocus
                      className="px-2 py-0.5 rounded-lg border border-[#006D77] text-xs sm:text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#006D77]"
                      placeholder="Enter new chat title..."
                    />
                    <button
                      type="submit"
                      disabled={savingTitle}
                      className="px-2 py-0.5 rounded-lg bg-[#006D77] text-white text-xs font-bold hover:bg-[#005a63] transition-colors"
                      title="Save title"
                    >
                      {savingTitle ? '...' : '✓'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(false)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center space-x-1.5 group cursor-pointer" onClick={() => {
                    setTitleInput(displayTitle);
                    setIsEditingTitle(true);
                  }}>
                    <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate max-w-xs sm:max-w-md hover:text-[#006D77] transition-colors" title="Click to rename chat">
                      {displayTitle}
                    </h1>
                    <button
                      type="button"
                      className="text-slate-400 group-hover:text-[#006D77] text-xs transition-colors p-0.5"
                      title="Rename chat"
                    >
                      ✏️
                    </button>
                  </div>
                )}

                {/* Interactive Mark Category & Risk Severity Selectors */}
                <select
                  value={flag || 'low'}
                  onChange={(e) => handleMarkCategoryInReport(undefined, e.target.value)}
                  title="Click to mark Risk Severity"
                  className="cursor-pointer appearance-none outline-none font-extrabold text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-all hover:scale-105 shadow-2xs bg-white text-slate-800 border-[#83C5BE]/60"
                >
                  <option value="high" className="text-slate-900 bg-white font-bold">🚨 HIGH ALERT</option>
                  <option value="medium" className="text-slate-900 bg-white font-bold">⚠️ MEDIUM RISK</option>
                  <option value="low" className="text-slate-900 bg-white font-bold">✅ LOW RISK</option>
                </select>

                <select
                  value={caseData.status === 'completed' ? 'completed' : caseData.status === 'clarifying' ? 'clarifying' : 'draft'}
                  onChange={(e) => handleMarkCategoryInReport(e.target.value, undefined)}
                  title="Click to mark Document Status"
                  className="cursor-pointer appearance-none outline-none font-bold text-[9px] tracking-wide px-2.5 py-0.5 rounded-full border transition-all hover:scale-105 shadow-2xs bg-[#EDF6F9] text-[#006D77] border-[#83C5BE]/60"
                >
                  <option value="completed" className="text-slate-900 bg-white font-bold">✅ Fully Analyzed</option>
                  <option value="clarifying" className="text-slate-900 bg-white font-bold">💬 Needs Clarification</option>
                  <option value="draft" className="text-slate-900 bg-white font-bold">📝 Draft / Collecting</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Analyzed on {new Date(caseData.created_at || Date.now()).toLocaleDateString()} · Active Chat Session
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Toggle Drawer */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="px-3.5 py-1.5 rounded-full bg-[#EDF6F9] hover:bg-[#83C5BE]/20 text-[#006D77] border border-[#83C5BE]/40 text-xs font-bold transition-all flex items-center space-x-1.5"
            >
              <span>{showSidebar ? 'Hide Panel' : 'Show Panel'}</span>
            </button>

            {/* Export Report PDF / TXT */}
            <button
              onClick={handleExport}
              className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-all flex items-center space-x-1 shadow-2xs"
            >
              <span>📥 Export Chat</span>
            </button>

            {/* Delete Case */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {/* ── Mobile Native Chatbot App Bar (< 1024px) ── */}
        <div className="lg:hidden bg-white rounded-2xl border border-[#83C5BE]/40 shadow-xs p-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <Link to="/dashboard" className="text-xs font-bold text-[#006D77] shrink-0 hover:underline">
                ← Back
              </Link>
              <span className="text-slate-300">|</span>
              <h1 className="text-xs font-extrabold text-slate-900 truncate" title={displayTitle}>
                {displayTitle}
              </h1>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              {flag === 'high' ? (
                <span className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[8px] font-extrabold uppercase">
                  HIGH ALERT
                </span>
              ) : flag === 'medium' ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-extrabold uppercase">
                  MED RISK
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-[#EDF6F9] border border-[#83C5BE]/50 text-[#006D77] text-[8px] font-extrabold uppercase">
                  LOW RISK
                </span>
              )}

              <button
                onClick={handleExport}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-600 text-xs"
                title="Export Chat"
              >
                📥
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1 rounded-full hover:bg-rose-50 text-rose-600 text-xs"
                title="Delete Case"
              >
                🗑️
              </button>
            </div>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex items-center bg-[#EDF6F9] p-1 rounded-full border border-[#83C5BE]/40 shadow-2xs">
            <button
              type="button"
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-1.5 px-3 rounded-full text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 ${
                mobileTab === 'chat'
                  ? 'bg-[#006D77] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>💬</span>
              <span>Document Copilot Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('insights')}
              className={`flex-1 py-1.5 px-3 rounded-full text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 ${
                mobileTab === 'insights'
                  ? 'bg-[#006D77] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📊</span>
              <span>Case Insights</span>
            </button>
          </div>
        </div>

        {/* ── Main Body: Chat Stream (Flex 1) + Context Drawer ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">

          {/* ── Left Side: Interactive Chat Room (Cols 8 or 12) ── */}
          <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'} ${showSidebar ? 'lg:col-span-8' : 'lg:col-span-12'} flex-col bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm overflow-hidden h-[calc(100vh-165px)] min-h-[500px] lg:h-[calc(100vh-210px)] lg:min-h-[640px]`}>

            {/* Chat Stream Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#EDF6F9] to-white border-b border-[#83C5BE]/30 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#006D77] animate-pulse" />
                <span className="text-xs font-extrabold text-[#006D77] uppercase tracking-wider">
                  Document Copilot Chat
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                Grounded in {evidenceList.length || 1} file context(s)
              </span>
            </div>

            {/* Chat Messages Scroll Container */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {messages.map((m, idx) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black shadow-2xs ${
                        isUser
                          ? 'bg-[#006D77] text-white'
                          : 'bg-[#EDF6F9] border border-[#83C5BE]/50 text-[#006D77]'
                      }`}
                    >
                      {isUser ? (user?.email?.[0]?.toUpperCase() || 'U') : '✦'}
                    </div>

                    {/* Bubble */}
                    <div className={`space-y-1.5 max-w-[85%] sm:max-w-[78%]`}>
                      <div
                        className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed transition-all ${
                          isUser
                            ? 'bg-[#006D77] text-white rounded-tr-none shadow-md font-medium'
                            : 'bg-[#EDF6F9]/70 border border-[#83C5BE]/40 text-slate-800 rounded-tl-none shadow-2xs font-normal'
                        }`}
                      >
                        {/* Source Fusion Badge (Only for AI messages) */}
                        {!isUser && (
                          <SourceFusionBadge
                            sources={
                              m.sources && m.sources.length > 0
                                ? m.sources
                                : (caseData?.evidence && caseData.evidence.length > 0)
                                ? caseData.evidence.map((e) => {
                                    const name = e.original_name || 'Evidence File';
                                    const mime = (e.file_type || '').toLowerCase();
                                    const ext = name.split('.').pop().toLowerCase();
                                    let type = 'document';
                                    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
                                      type = 'image';
                                    } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(ext) || name.toLowerCase().includes('voice')) {
                                      type = 'audio';
                                    } else if (mime === 'text/plain' || ext === 'txt' || name === 'user_description.txt') {
                                      type = 'text';
                                    }
                                    return { type, label: name };
                                  })
                                : [{ type: 'document', label: 'Document Context' }]
                            }
                          />
                        )}

                        {/* Text Content */}
                        {m.text && (
                          isUser ? (
                            <div className="whitespace-pre-wrap font-sans font-medium">{m.text}</div>
                          ) : (
                            <FormattedChatMessage text={m.text} />
                          )
                        )}

                        {/* Inline Image Previews for user messages */}
                        {isUser && m.imageAttachments && m.imageAttachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.imageAttachments.map((img, iIdx) =>
                              img.previewUrl ? (
                                <div key={iIdx} className="relative group">
                                  <img
                                    src={img.previewUrl}
                                    alt={img.name}
                                    className="max-w-[200px] max-h-[160px] rounded-xl object-cover border-2 border-white/30 shadow-md"
                                    title={img.name}
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] font-semibold px-2 py-0.5 rounded-b-xl truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                    {img.name}
                                  </div>
                                </div>
                              ) : (
                                <span key={iIdx} className="text-white/80 text-xs">📷 {img.name}</span>
                              )
                            )}
                          </div>
                        )}

                        {/* Non-image file chips in user message */}
                        {isUser && m.otherAttachments && m.otherAttachments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {m.otherAttachments.map((name, aIdx) => (
                              <span
                                key={aIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white/90 text-[10px] font-semibold border border-white/20"
                              >
                                📄 {name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Citations if AI */}
                        {!isUser && m.cited && m.cited.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-[#83C5BE]/30 text-[10px] space-y-1">
                            <span className="font-extrabold text-[#006D77] uppercase tracking-wider block">{t('chat.sourcesCited')}</span>
                            {m.cited.map((c, cIdx) => (
                              <div key={cIdx} className="text-slate-600 font-medium">
                                • {c.summary || c.department || `Case #${c.case_id}`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action Row for AI Message (TTS & Copy) */}
                      {!isUser && (
                        <div className="flex items-center space-x-2 px-1">
                          <button
                            onClick={() => handleSpeech(m.text, idx)}
                            className="text-[10px] font-bold text-[#006D77] hover:underline flex items-center space-x-1"
                          >
                            <span>{speakingIdx === idx ? t('chat.stopVoice') : t('chat.listen')}</span>
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(m.text)}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {t('chat.copy')}
                          </button>
                          <span className="text-slate-300">•</span>
                          <span className="text-[9px] text-slate-400">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {sending && (
                <div className="flex items-center space-x-2 text-xs font-bold text-[#006D77] p-3 rounded-2xl bg-[#EDF6F9]/50 w-max border border-[#83C5BE]/30">
                  <div className="w-2 h-2 rounded-full bg-[#006D77] animate-ping" />
                  <span>AI Copilot is analyzing & responding...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* ── Suggested Prompts Chips ── */}
            <div className="px-5 py-2 bg-[#EDF6F9]/30 border-t border-[#83C5BE]/20 flex items-center gap-2 overflow-x-auto shrink-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#006D77] shrink-0">{t('chat.promptsLabel')}</span>
              {suggestedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  className="px-3 py-1 rounded-full bg-white hover:bg-[#EDF6F9] border border-[#83C5BE]/40 text-[10px] font-semibold text-slate-700 hover:text-[#006D77] transition-all shrink-0 shadow-2xs hover:scale-102"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* ── Ultra-Compact Handy Pill Input Bar ── */}
            <div className="p-3 bg-white border-t border-[#83C5BE]/30 shrink-0">
              {/* Hidden File Upload Input */}
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleChatFileSelect}
                accept="audio/*,image/*,application/pdf,text/plain,text/csv"
                className="hidden"
              />

              {/* Attached File Chips / Image Thumbnails (if any) */}
              {chatFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 px-1">
                  {chatFiles.map((file, idx) => (
                    <div key={idx} className="relative group">
                      {file.type?.startsWith('image/') && file.previewUrl ? (
                        // Image thumbnail preview
                        <div className="relative flex items-center">
                          <img
                            src={file.previewUrl}
                            alt={file.name}
                            className="w-14 h-14 rounded-xl object-cover border-2 border-[#83C5BE]/50 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeChatFile(idx)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 text-white text-[9px] font-black flex items-center justify-center hover:bg-rose-600 transition-colors shadow"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        // Non-image file chip
                        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#EDF6F9] border border-[#83C5BE]/50 text-xs font-bold text-[#006D77] shadow-2xs">
                          <span className="text-[10px]">{file.type?.startsWith('audio') ? '🎙️' : '📄'}</span>
                          <span className="truncate max-w-[120px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeChatFile(idx)}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}


              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 rounded-full border border-[#83C5BE]/60 bg-[#F8FCFD] px-3.5 py-1.5 transition-all focus-within:border-[#006D77] focus-within:ring-2 focus-within:ring-[#006D77]/15 shadow-2xs"
              >
                {/* Left Controls: Minimal Icons for Attachment & Recording */}
                <div className="flex items-center space-x-1 shrink-0">
                  {/* Minimal Paperclip Attachment Icon */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-full text-slate-500 hover:text-[#006D77] hover:bg-[#006D77]/10 transition-colors"
                    title="Attach document or image"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.58a2 2 0 0 1-2.83-2.83l7.9-7.9" />
                    </svg>
                  </button>

                  {/* Minimal Microphone Recording Icon */}
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center space-x-1 animate-pulse"
                      title="Stop recording"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>Stop ({recordingSeconds}s)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-1.5 rounded-full text-slate-500 hover:text-[#006D77] hover:bg-[#006D77]/10 transition-colors"
                      title="Record live voice note"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Center Input Field */}
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={isRecording ? "Listening... Speak now..." : t('chat.placeholder')}
                  className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none px-2 py-1.5"
                />

                {/* Right Send Button */}
                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && chatFiles.length === 0) || sending}
                  className="p-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white transition-all disabled:opacity-30 shadow-2xs hover:scale-105 active:scale-95 flex items-center justify-center shrink-0"
                  title="Send message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </form>
            </div>

          </div>

          {/* ── Right Side: Context Drawer & Executive Insights (Cols 4) ── */}
          {showSidebar && (
            <div className={`${mobileTab === 'insights' ? 'block' : 'hidden lg:block'} lg:col-span-4 h-auto max-h-[calc(100vh-250px)] lg:h-[calc(100vh-210px)] lg:min-h-[640px] overflow-y-auto pr-1 space-y-4 custom-scrollbar`}>

              {/* URGENT CRITICAL ALERT CARD — MOVED TO TOP OF RIGHT PANEL FOR IMMEDIATE USER NEED */}
              {(flag === 'high' || findings.severity === 'high' || findings.escalation_flag === 'high') && (
                <div className="bg-rose-50 rounded-3xl border-2 border-rose-300 p-5 space-y-3 shadow-md animate-pulse">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping shrink-0" />
                    <h4 className="text-xs font-black text-rose-900 uppercase tracking-wider">
                      🚨 IMMEDIATE ACTION REQUIRED / HIGH RISK ALERT
                    </h4>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed font-bold">
                    Critical or high-risk findings detected in this case. Immediate specialist check-up or security action is strongly recommended.
                  </p>
                  <a
                    href={caseData.department === 'fraud' ? "https://cybercrime.gov.in/" : "https://www.google.com/maps/search/doctors+near+me"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block w-full text-center py-2.5 px-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md transition-all hover:scale-102"
                  >
                    {caseData.department === 'fraud' ? 'Report to CyberCrime Authorities →' : 'Find Nearby Specialists on Google Maps →'}
                  </a>
                </div>
              )}

              {/* Card 7: Trust Circle Safeguards & Peer Notifications — MOVED TO TOP OF STACK */}
              <div className="bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm p-4 space-y-2">
                <div 
                  onClick={() => toggleCardCollapse('trustCircle')}
                  className="flex items-center justify-between cursor-pointer select-none group"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77]">
                    🛡️ Trust Circle Safeguards
                  </span>
                  <span className="text-xs text-slate-400 group-hover:text-[#006D77] transition-colors">
                    {collapsedCards['trustCircle'] ? '▼' : '▲'}
                  </span>
                </div>
                {!collapsedCards['trustCircle'] && (
                  <CaseTrustCircleCard caseData={caseData} />
                )}
              </div>

              {/* Card 3: Key Concepts & Term Glossary (Interactive AI Pills) */}
              {((findings.symptoms && findings.symptoms.length > 0) ||
                (findings.likely_associations && findings.likely_associations.length > 0)) && (
                <div className="bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm p-5 space-y-3">
                  <div 
                    onClick={() => toggleCardCollapse('concepts')}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 cursor-pointer select-none group"
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77]">
                      {t('chat.keyConcepts')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] text-slate-400 font-semibold">{t('chat.clickToAsk')}</span>
                      <span className="text-xs text-slate-400 group-hover:text-[#006D77] transition-colors">
                        {collapsedCards['concepts'] ? '▼' : '▲'}
                      </span>
                    </div>
                  </div>
                  {!collapsedCards['concepts'] && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[...(findings.symptoms || []), ...(findings.likely_associations || [])].map((concept, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(`Can you explain '${concept}' in detail based on my uploaded records?`)}
                          className="px-2.5 py-1 rounded-full bg-[#EDF6F9] hover:bg-[#006D77] hover:text-white border border-[#83C5BE]/40 text-[10px] font-semibold text-[#006D77] transition-all shadow-2xs cursor-pointer hover:scale-102"
                          title={`Ask AI about ${concept}`}
                        >
                          💡 {concept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Card 4: Interactive Action Plan & Reminders */}
              {remediationList.length > 0 && (
                <div className="bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm p-5 space-y-3">
                  <div 
                    onClick={() => toggleCardCollapse('actionPlan')}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 cursor-pointer select-none group"
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77]">
                      {t('chat.actionPlan')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {Object.values(completedReminders).filter(Boolean).length}/{remediationList.length} Done
                      </span>
                      <span className="text-xs text-slate-400 group-hover:text-[#006D77] transition-colors">
                        {collapsedCards['actionPlan'] ? '▼' : '▲'}
                      </span>
                    </div>
                  </div>
                  {!collapsedCards['actionPlan'] && (
                    <>
                      <div className="space-y-2">
                        {remediationList.map((item, idx) => {
                          const isDone = !!completedReminders[idx];
                          return (
                            <div
                              key={idx}
                              onClick={() => setCompletedReminders((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                              className={`p-2.5 rounded-xl border text-xs font-medium flex items-start space-x-2.5 cursor-pointer transition-all ${
                                isDone
                                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 line-through opacity-70'
                                  : 'bg-[#F8FCFD] border-[#83C5BE]/30 text-slate-700 hover:border-[#006D77]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() => {}}
                                className="mt-0.5 rounded text-[#006D77] focus:ring-[#006D77] cursor-pointer"
                              />
                              <span className="flex-1 leading-snug">{item}</span>
                            </div>
                          );
                        })}
                      </div>
                      <Link
                        to="/dashboard"
                        className="block text-center w-full py-2 px-3 rounded-full bg-[#EDF6F9] hover:bg-[#83C5BE]/20 text-[#006D77] text-[10px] font-bold border border-[#83C5BE]/40 transition-colors mt-2"
                      >
                        🔔 Manage Smart Reminders on Dashboard →
                      </Link>
                    </>
                  )}
                </div>
              )}

              {/* Card 6: 100% Free Notification & Google Calendar Reminders */}
              <div className="bg-[#FFFFFF] rounded-3xl border border-[#83C5BE]/40 shadow-sm p-4 space-y-2">
                <div 
                  onClick={() => toggleCardCollapse('reminders')}
                  className="flex items-center justify-between cursor-pointer select-none group"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77]">
                    🔔 Case Reminders & Calendar
                  </span>
                  <span className="text-xs text-slate-400 group-hover:text-[#006D77] transition-colors">
                    {collapsedCards['reminders'] ? '▼' : '▲'}
                  </span>
                </div>
                {!collapsedCards['reminders'] && (
                  <CaseReminderCard caseData={caseData} />
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default CaseReport;
