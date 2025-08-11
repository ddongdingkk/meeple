// === MEEPLE MBTI 대화연습 - API 기반 최소구성 스크립트 (전체 교체본) ===
// 작성일: 2025-08-11 (KST)
// 목적: OpenAI API 사용 전제로 불필요한 로컬 응답/폴백 제거, 오프닝도 API 생성,
//       상황 범주 고정(system prompt), UI 헤더(상대방 MBTI/선택 상황) 정확 표시

// =========================
// 0) AI API 설정
// =========================
const AI_API_CONFIG = {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY_HERE' // TODO: 실제 키로 교체
    },
    model: 'gpt-4o-mini',
    temperature: 0.6,
    max_tokens: 180
  };
  
  // =========================
  // 1) 전역 상태
  // =========================
  let analysisData = {
    myMBTI: '',
    partnerMBTI: '',
    selectedProblem: '',
    conversationContext: '', // 'lover' | 'boss'
  };
  let chatData = {
    messages: [],   // { sender: 'user'|'bot', content: string }
    turnCount: 0
  };
  
  // 화면 참조
  const screens = {
    mainMenu: document.getElementById('main-menu'),
    mbtiInput: document.getElementById('mbti-input'),
    conversationContext: document.getElementById('conversation-context'),
    problemSelection: document.getElementById('problem-selection'),
    chatScreen: document.getElementById('chat-screen'),
    analysisScreen: document.getElementById('analysis-screen')
  };
  
  // 안전 접근 헬퍼
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  
  // =========================
  // 2) 유틸
  // =========================
  function showScreen(id) {
    Object.values(screens).forEach(el => { if (el) el.classList.remove('active'); });
    const el = (
      id === 'main-menu' ? screens.mainMenu :
      id === 'mbti-input' ? screens.mbtiInput :
      id === 'conversation-context' ? screens.conversationContext :
      id === 'problem-selection' ? screens.problemSelection :
      id === 'chat-screen' ? screens.chatScreen :
      id === 'analysis-screen' ? screens.analysisScreen : null
    );
    if (el) el.classList.add('active');
  }
  
  function resetSelections() {
    $$('.context-option').forEach(i => i.classList.remove('selected'));
    $$('.problem-item').forEach(i => i.classList.remove('selected'));
  }
  
  function getChosenSituationText() {
    const selectedEl = document.querySelector('.problem-item.selected span');
    if (selectedEl) {
      return selectedEl.textContent.replace(/^•\s*/, '').trim();
    }
    // 백업: data-problem이 있다면 그 값을 그대로 쓸 수도 있음
    return '선택된 상황이 없습니다';
  }
  
  // =========================
  // 3) OpenAI 프롬프트/호출
  // =========================
  function buildSystemPrompt({ myMBTI, partnerMBTI, context, situation }) {
    const roleKorean = context === 'lover' ? '연인' : '직장 상사';
    return [
      {
        role: 'system',
        content: [
          `너는 ${roleKorean} 역할의 ${partnerMBTI} 유형이다.`,
          `- 상황: "${situation}"`,
          `- 반드시 한국어로 답한다.`,
          `- 항상 이 상황 범주 안에서만 응답한다(주제 확장 금지).`,
          `- 길이는 1~2문장. 마지막에 질문은 최대 1개만.`,
          `- ${partnerMBTI} 톤은 가볍게 반영하되 과장/장문/과잉 사과 금지.`,
          `- 민감한 상담/의학/법률 조언은 피하고 필요 시 전문가 상담을 한 문장으로 권고.`
        ].join('\n')
      }
    ];
  }
  
  async function callAIAPI(messages, { model, temperature, max_tokens } = {}) {
    const body = {
      model: model || AI_API_CONFIG.model,
      messages,
      temperature: temperature ?? AI_API_CONFIG.temperature,
      max_tokens: max_tokens ?? AI_API_CONFIG.max_tokens
    };
    const res = await fetch(AI_API_CONFIG.url, {
      method: 'POST',
      headers: AI_API_CONFIG.headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API 호출 실패 (${res.status}): ${text}`);
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }
  
  // =========================
  // 4) 채팅 UI
  // =========================
  function addMessage(sender, content) {
    const list = $('#chat-messages');
    if (!list) return;
    const item = document.createElement('div');
    item.className = `message ${sender === 'user' ? 'user' : 'bot'}`;
    const meta = document.createElement('div');
    meta.className = 'message-sender';
    meta.textContent = sender === 'user' ? '나' : '상대방';
    const bubble = document.createElement('div');
    bubble.className = 'message-content';
    bubble.textContent = content;
    item.appendChild(meta);
    item.appendChild(bubble);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    chatData.messages.push({ sender, content });
  }
  
  async function sendMessage() {
    const input = $('#chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    input.value = '';
    try {
      const reply = await generateAIBotResponse(text);
      addMessage('bot', reply || '...');
      chatData.turnCount = (chatData.turnCount || 0) + 1;
      const endBtn = $('#end-chat-btn');
      if (endBtn && chatData.turnCount >= 10) {
        endBtn.textContent = '대화 분석하기';
        endBtn.style.display = 'block';
      }
    } catch (e) {
      console.error(e);
      addMessage('bot', '잠시 후 다시 시도해줘.');
    }
  }
  
  // =========================
  // 5) 대화 로직
  // =========================
  async function startChat() {
    // 헤더 표시: 상대방 MBTI & 상황(선택 텍스트)
    const partnerMBTI = analysisData.partnerMBTI;
    const situation = getChosenSituationText();
    const context = analysisData.conversationContext;
    const myMBTI = analysisData.myMBTI;
  
    const mbtiEl = $('#chat-partner-mbti');
    const sitEl = $('#chat-situation');
    if (mbtiEl) mbtiEl.textContent = partnerMBTI || '(미지정)';
    if (sitEl) sitEl.textContent = situation;
  
    // 대화 상태 초기화
    chatData = { messages: [], turnCount: 0 };
  
    // 오프닝 메시지도 API로 생성
    const sys = buildSystemPrompt({ myMBTI, partnerMBTI, context, situation });
    const openingUser = { role: 'user', content: '대화를 시작해줘. 상황을 이해하고 내가 편하게 얘기할 수 있도록 간단히 질문해줘.' };
    try {
      const bot = await callAIAPI([...sys, openingUser]);
      addMessage('bot', bot || '안녕! 어떻게 도와줄까?');
    } catch (e) {
      console.error(e);
      addMessage('bot', '시작에 실패했어. 잠시 후 다시 시도해줘.');
    }
  
    showScreen('chat-screen');
  }
  
  async function generateAIBotResponse(userMessage) {
    const myMBTI = analysisData.myMBTI;
    const partnerMBTI = analysisData.partnerMBTI;
    const context = analysisData.conversationContext;
    const situation = getChosenSituationText();
  
    const sys = buildSystemPrompt({ myMBTI, partnerMBTI, context, situation });
    // 최근 6턴만 유지
    const history = chatData.messages.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
    const messages = [...sys, ...history, { role: 'user', content: userMessage }];
    return await callAIAPI(messages);
  }
  
  // =========================
  // 6) 이벤트 바인딩
  // =========================
  function wireEvents() {
    // 메인 → 대화연습
    const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) chatBtn.addEventListener('click', () => {
      resetSelections();
      showScreen('mbti-input');
    });
  
    // MBTI 입력
    const nextBtn = document.getElementById('next-to-problem');
    const backToMenu = document.getElementById('back-to-menu');
    if (backToMenu) backToMenu.addEventListener('click', () => showScreen('main-menu'));
    if (nextBtn) nextBtn.addEventListener('click', () => {
      const mySel = document.getElementById('my-mbti');
      const partnerSel = document.getElementById('partner-mbti');
      analysisData.myMBTI = mySel?.value || '';
      analysisData.partnerMBTI = partnerSel?.value || '';
      if (!analysisData.myMBTI || !analysisData.partnerMBTI) {
        alert('내 MBTI와 상대방 MBTI를 모두 선택해 주세요.');
        return;
      }
      showScreen('conversation-context');
    });
  
    // 맥락 선택
    $$('.context-option').forEach(opt => {
      opt.addEventListener('click', () => {
        $$('.context-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        analysisData.conversationContext = opt.dataset.context || '';
        showScreen('problem-selection');
        // 연인/상사 카테고리 토글 (있다면)
        const lover = document.getElementById('lover-problems');
        const boss = document.getElementById('boss-problems');
        if (lover && boss) {
          lover.style.display = analysisData.conversationContext === 'lover' ? 'block' : 'none';
          boss.style.display  = analysisData.conversationContext === 'boss'  ? 'block' : 'none';
        }
      });
    });
  
    // 문제 선택
    $$('.problem-item').forEach(item => {
      item.addEventListener('click', () => {
        $$('.problem-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        analysisData.selectedProblem = item.dataset.problem || '';
        startChat();
      });
    });
  
    // 채팅 입력
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    const input = document.getElementById('chat-input');
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  
    // 뒤로 버튼들 (옵션)
    const backToMbtiFromContext = document.getElementById('back-to-mbti-from-context');
    if (backToMbtiFromContext) backToMbtiFromContext.addEventListener('click', () => showScreen('mbti-input'));
  }
  
  // =========================
  // 7) 부트스트랩
  // =========================
  document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    // 초기 화면은 index.html에서 main-menu가 active
  });
  