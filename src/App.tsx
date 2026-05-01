// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { wordDatabase } from "./words";

// --- 2. 工具函數 ---
function generateSmartOptions(
  targetWord: any,
  allWords: any,
  wrongHistory: any = []
) {
  // 1. 防呆：確保單字庫是有效的，過濾掉缺少 en 或 zh 的「髒資料」
  const validAllWords = (allWords || []).filter(
    (w: any) => w && w.id && w.en && w.zh
  );

  if (!targetWord || !targetWord.id) return [];

  const isLucky = Math.random() < 0.1;

  // 2. 轉換錯題本，並排除目前的目標單字
  const historyArray = Array.isArray(wrongHistory)
    ? wrongHistory
    : Object.values(wrongHistory || {});
  const validHistory = historyArray.filter(
    (w: any) => w && w.id && w.id !== targetWord.id
  );

  let selectedWrong: any[] = []

  // 3. 更安全的隨機抽取（使用 Math.floor）
  if (isLucky && validHistory.length > 0) {
    const randomIndex = Math.floor(Math.random() * validHistory.length);
    selectedWrong.push(validHistory[randomIndex]);
  }

  // 4. 【關鍵修復】改用 .some(sw => sw.id === w.id) 比對 ID，解決記憶體參考不同的問題
  const availableWords = validAllWords.filter(
    (w: any) =>
      w.id !== targetWord.id && !selectedWrong.some((sw) => sw.id === w.id)
  );

  // 5. 補足剩下的錯誤選項
  const neededCount = 3 - selectedWrong.length;
  const randomFills = [...availableWords]
    .sort(() => 0.5 - Math.random())
    .slice(0, neededCount);

  // 6. 組合選項並過濾掉潛在的 undefined
  const finalOptions = [...selectedWrong, ...randomFills, targetWord].filter(
    Boolean
  );

  return finalOptions.sort(() => 0.5 - Math.random());
}

// 播放正確/錯誤音效
const playFeedbackSound = (isCorrect: any) => {
  const AudioContext =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  if (isCorrect) {
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }
};

// 播放爆炸音效 (利用白噪音合成)
const playExplosionSound = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();

  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1; // 產生白噪音
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 1.5);
};

const speakWord = (text: string) => {
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
};

// --- 3. 遊戲測驗畫面元件 ---
// --- 3. 遊戲測驗畫面元件 ---
function QuizScreen({ mode, wrongWords, setWrongWords, setActiveTab }: any) {
  const [currentWord, setCurrentWord] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [isEngToZh, setIsEngToZh] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [combo, setCombo] = useState(0);
  const [animClass, setAnimClass] = useState("");
  // 監視 Combo 數字，達成特定條件就播放對應的語音
  useEffect(() => {
    if (combo === 2) {
      // 播放 Great 音效 (改成 .wav)
      const audio = new Audio("/great.wav");
      audio.play().catch((e) => console.log("播放音效失敗", e));
    } else if (combo === 4) {
      // 播放 Amazing 音效 (改成 .wav)
      const audio = new Audio("/amazing.wav");
      audio.play().catch((e) => console.log("播放音效失敗", e));
    }
  }, [combo]);

  // 炸彈系統狀態
  const [bombGauge, setBombGauge] = useState(0);
  const [isExploded, setIsExploded] = useState(false);

  const wrongWordsRef = useRef(wrongWords);
  useEffect(() => {
    wrongWordsRef.current = wrongWords;
  }, [wrongWords]);

  const generateQuestion = () => {
    setAnimClass("");
    const isEng = Math.random() > 0.5;
    setIsEngToZh(isEng);

    // 1. 取得原始題庫
    const rawPool =
      mode === "challenge"
        ? Object.values(wrongWordsRef.current)
        : wordDatabase;

    // 2. 【關鍵防護】再次過濾，確保抽題池內 100% 都是包含完整屬性的有效單字
    const pool = rawPool.filter((w: any) => w && w.id && w.en && w.zh);

    if (mode === "challenge" && pool.length === 0) {
      alert("🎉 太神了！你已經成功消滅所有錯誤單字！");
      setActiveTab("bank");
      return;
    }

    // 防呆：如果過濾後題庫為空，避免當機
    if (pool.length === 0) {
      console.error("警告：題庫內沒有有效的單字資料！請檢查 words.js");
      return;
    }

    // 3. 【關鍵修復】使用 Math.floor(Math.random() * length) 確保必定抽到合法 Index
    const randomIndex = Math.floor(Math.random() * pool.length);
    const answer = pool[randomIndex];

    if (!answer) return;

    // 4. 【關鍵修復】傳入 wrongWordsRef.current
    const choices = generateSmartOptions(
      answer,
      wordDatabase,
      wrongWordsRef.current
    );

    setCurrentWord(answer);
    setOptions(choices);
    setSelectedAnswer(null);

    if (isEng) setTimeout(() => speakWord(answer.en), 300);
  };

  useEffect(() => {
    setCombo(0);
    setBombGauge(0);
    setIsExploded(false);
    generateQuestion();
    // eslint-disable-next-line
  }, [mode]);

  const handleOptionClick = (option: any) => {
    if (selectedAnswer || isExploded) return;
    setSelectedAnswer(option);
    const isCorrect = option.id === currentWord.id;

    if (isCorrect) {
      playFeedbackSound(true);
      setCombo((prev) => prev + 1);
      setAnimClass("animate-bounce");

      // 答對時，炸彈進度條減少 15% (最低為 0)
      setBombGauge((prev) => Math.max(0, prev - 15));

      if (mode === "challenge") {
        setWrongWords((prev: any) => {
          const currentStreak = (prev[currentWord.id]?.streak || 0) + 1;
          if (currentStreak >= 5) {
            const newWords = { ...prev };
            delete newWords[currentWord.id];
            return newWords;
          } else {
            return {
              ...prev,
              [currentWord.id]: { ...currentWord, streak: currentStreak },
            };
          }
        });
      }
      setTimeout(generateQuestion, 1500);
    } else {
      playFeedbackSound(false);
      setCombo(0);
      setAnimClass("animate-shake");

      // 答錯時，炸彈進度條增加 25%
      const newGauge = bombGauge + 25;
      setBombGauge(newGauge);

      setWrongWords((prev: any) => ({
        ...prev,
        [currentWord.id]: { ...currentWord, streak: 0 },
      }));

      // 判斷是否爆炸
      if (newGauge >= 100) {
        setTimeout(() => {
          playExplosionSound();
          setIsExploded(true);
        }, 800); // 等待錯誤動畫播完再爆炸
      } else {
        setTimeout(generateQuestion, 2000);
      }
    }
  };

  const restartGame = () => {
    setBombGauge(0);
    setCombo(0);
    setIsExploded(false);
    generateQuestion();
  };

  // 爆炸結算畫面
  if (isExploded) {
    return (
      <div
        className="animate-shake"
        style={{
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
        }}
      >
        <div style={{ fontSize: "80px", marginBottom: "10px" }}>💥</div>
        <h2
          style={{
            color: "#ef4444",
            fontSize: "32px",
            fontWeight: "bold",
            marginBottom: "10px",
          }}
        >
          炸彈爆炸了！
        </h2>
        <p style={{ color: "#6b7280", fontSize: "18px", marginBottom: "30px" }}>
          不小心錯太多題囉，再接再厲！
        </p>
        <button
          onClick={restartGame}
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "15px 40px",
            borderRadius: "30px",
            fontSize: "20px",
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 6px rgba(59, 130, 246, 0.3)",
          }}
        >
          🔄 重新挑戰
        </button>
      </div>
    );
  }

  if (!currentWord) return <div>載入中...</div>;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "400px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "15px",
        }}
      >
        <h2
          style={{
            color: mode === "challenge" ? "#ef4444" : "#f97316",
            fontWeight: "bold",
            margin: 0,
          }}
        >
          {mode === "challenge" ? "⚔️ 復仇連擊" : "🔥 COMBO"} {combo}
        </h2>
      </div>

      {/* 炸彈進度條 UI */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          marginBottom: "25px",
          background: "white",
          padding: "10px 15px",
          borderRadius: "15px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <span style={{ fontSize: "28px", marginRight: "10px" }}>💣</span>
        <div
          style={{
            flex: 1,
            height: "16px",
            backgroundColor: "#f3f4f6",
            borderRadius: "10px",
            overflow: "hidden",
            border: "2px solid #e5e7eb",
          }}
        >
          <div
            style={{
              width: `${Math.min(bombGauge, 100)}%`,
              height: "100%",
              backgroundColor: bombGauge > 70 ? "#ef4444" : "#f87171",
              transition: "width 0.4s ease-in-out, background-color 0.4s",
            }}
          ></div>
        </div>
      </div>

      <div
        className={animClass}
        onClick={() => speakWord(currentWord.en)}
        style={{
          width: "100%",
          backgroundColor: mode === "challenge" ? "#fee2e2" : "#dbeafe",
          color: "#1e3a8a",
          padding: "30px 20px",
          borderRadius: "20px",
          fontSize: "28px",
          fontWeight: "bold",
          textAlign: "center",
          marginBottom: "30px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          cursor: "pointer",
          transition: "all 0.3s",
        }}
      >
        {isEngToZh ? currentWord.en : currentWord.zh}
        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
            marginTop: "10px",
            fontWeight: "normal",
          }}
        >
          {isEngToZh ? "🔊 點擊可再次發音" : "🔊 點擊聽英文發音"}
        </div>
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
        {options.map((opt) => {
          let bgColor = "#ffffff",
            textColor = "#1f2937",
            borderColor = "#e5e7eb";
          if (selectedAnswer) {
            if (opt.id === currentWord.id) {
              bgColor = "#22c55e";
              textColor = "#ffffff";
              borderColor = "#16a34a";
            } else if (selectedAnswer.id === opt.id) {
              bgColor = "#ef4444";
              textColor = "#ffffff";
              borderColor = "#dc2626";
            }
          }
          return (
            <button
              key={opt.id}
              onClick={() => handleOptionClick(opt)}
              style={{
                padding: "18px",
                fontSize: "20px",
                fontWeight: "bold",
                borderRadius: "15px",
                backgroundColor: bgColor,
                color: textColor,
                border: `2px solid ${borderColor}`,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                transition: "all 0.2s",
              }}
            >
              {isEngToZh ? opt.zh : opt.en}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- 4. 我的單字庫畫面元件 ---
function VocabBankScreen({ wrongWords, setActiveTab }: any) {
  const wordsArray = Object.values(wrongWords);
  return (
    <div style={{ width: "100%", maxWidth: "400px" }}>
      <h2
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#1e3a8a",
          marginBottom: "20px",
          textAlign: "center",
        }}
      >
        我的單字庫 📚
      </h2>
      {wordsArray.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#6b7280",
            marginTop: "50px",
            fontSize: "18px",
          }}
        >
          目前沒有錯題喔！繼續保持！🎉
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {wordsArray.map((word) => (
            <div
              key={word.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "white",
                padding: "15px",
                borderRadius: "15px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                borderLeft: "5px solid #f87171",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#1f2937",
                  }}
                >
                  {word.en}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  {word.zh}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      style={{
                        color: star <= word.streak ? "#f59e0b" : "#e5e7eb",
                        fontSize: "16px",
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => speakWord(word.en)}
                style={{
                  background: "#dbeafe",
                  border: "none",
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                🔊
              </button>
            </div>
          ))}
          <button
            onClick={() => setActiveTab("challenge")}
            style={{
              marginTop: "20px",
              background: "linear-gradient(135deg, #f97316, #ef4444)",
              color: "white",
              padding: "18px",
              borderRadius: "15px",
              fontSize: "18px",
              fontWeight: "bold",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(249, 115, 22, 0.3)",
            }}
          >
            ⚔️ 挑戰以上單字
          </button>
        </div>
      )}
    </div>
  );
}

// --- 5. 主應用程式 ---
export default function App() {
  const [activeTab, setActiveTab] = useState("quiz");
  const [wrongWords, setWrongWords] = useState({});

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        backgroundColor: "#f9fafb",
        minHeight: "100vh",
        padding: "20px",
        paddingBottom: "100px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      <style>
        {`
          @keyframes shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }
          @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); background-color: #4ade80; color: white;} }
          .animate-shake { animation: shake 0.5s ease-in-out; border: 3px solid #ef4444 !important; }
          .animate-bounce { animation: bounce 0.5s ease-in-out; }
        `}
      </style>

      {activeTab === "bank" ? (
        <VocabBankScreen wrongWords={wrongWords} setActiveTab={setActiveTab} />
      ) : (
        <QuizScreen
          mode={activeTab}
          wrongWords={wrongWords}
          setWrongWords={setWrongWords}
          setActiveTab={setActiveTab}
        />
      )}

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          backgroundColor: "white",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "center",
          zIndex: 100,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            display: "flex",
            justifyContent: "space-around",
            padding: "10px 0",
          }}
        >
          <button
            onClick={() => setActiveTab("quiz")}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              color: activeTab === "quiz" ? "#3b82f6" : "#9ca3af",
            }}
          >
            <span style={{ fontSize: "24px", marginBottom: "4px" }}>🎮</span>
            <span style={{ fontSize: "14px", fontWeight: "bold" }}>
              無盡冒險
            </span>
          </button>
          <button
            onClick={() => setActiveTab("bank")}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              color:
                activeTab === "bank" || activeTab === "challenge"
                  ? "#3b82f6"
                  : "#9ca3af",
            }}
          >
            <span style={{ fontSize: "24px", marginBottom: "4px" }}>📚</span>
            <span style={{ fontSize: "14px", fontWeight: "bold" }}>單字庫</span>
          </button>
        </div>
      </div>
    </div>
  );
}
