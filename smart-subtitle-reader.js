/**
 * SmartSubtitleReader.js
 * 智能字幕显示与语音朗读库
 * 
 * 特点:
 * - 支持Markdown文本解析
 * - 智能分割长文本行
 * - 按句子/标点符号/强制分割策略显示字幕
 * - 自适应窗口大小
 * - 语音朗读同步显示
 * - 简洁的加载和完成动画
 */

class SmartSubtitleReader {
  /**
   * 创建智能字幕阅读器
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    // 默认配置
    this.config = {
      targetVoiceName: "Microsoft Yunyang Online", // 默认语音
      speechRate: 1.0,                            // 语速
      minWindowWidth: Math.floor(window.screen.availWidth * 0.3),
      maxWindowWidth: Math.floor(window.screen.availWidth * 0.9),
      maxTextWidth: Math.floor(window.screen.availWidth * 0.8), // 单行最大宽度
      singleLineHeight: 35,                       // 单行高度
      multiLineHeight: 70,                        // 多行高度
      completionDelay: 2000,                      // 完成后关闭延迟(ms)
      containerSelector: '#subtitle',             // 字幕容器选择器
      contentSelector: '#content',                // 内容容器选择器
      ...options
    };

    // 初始化DOM元素
    this.elements = {
      subtitle: document.querySelector(this.config.containerSelector),
      content: document.querySelector(this.config.contentSelector)
    };

    // 确保DOM元素存在
    if (!this.elements.subtitle || !this.elements.content) {
      throw new Error(`找不到元素: ${this.config.containerSelector} 或 ${this.config.contentSelector}`);
    }

    // 创建Canvas用于文本测量
    this.textCanvas = document.createElement("canvas");
    this.textContext = this.textCanvas.getContext("2d");
    this.textContext.font = "22px Microsoft YaHei UI, Segoe UI, sans-serif";
    
    // 绑定方法
    this._onVoicesChanged = this._onVoicesChanged.bind(this);
  }

  /**
   * 显示字幕动画
   * @param {string} type - 动画类型 ('loading' 或 'completion')
   */
  showAnimation(type) {
    const itemClass = type === 'loading' ? 'dot' : 'bar';
    const items = Array(5).fill(`<div class="animation-item ${itemClass}"></div>`).join('');
    this.elements.subtitle.innerHTML = `<div class="animation-container">${items}</div>`;
  }

  /**
   * 获取文本显示宽度
   * @param {string} text - 要测量的文本
   * @returns {number} 文本宽度(px)
   */
  getTextWidth(text) {
    return this.textContext.measureText(text).width + 60;
  }

  /**
   * 根据文本长度调整窗口大小
   * @param {string} text - 待显示的文本
   */
  adjustWindowSize(text) {
    const textWidth = this.getTextWidth(text);
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    
    let newWidth, newHeight;
    
    if (textWidth > this.config.maxWindowWidth) {
      this.elements.subtitle.className = 'multi-line';
      newWidth = this.config.maxWindowWidth;
      newHeight = this.config.multiLineHeight;
    } else {
      this.elements.subtitle.className = 'single-line';
      newWidth = Math.max(this.config.minWindowWidth, Math.min(textWidth, this.config.maxWindowWidth));
      newHeight = this.config.singleLineHeight;
    }
    
    window.resizeTo(newWidth, newHeight);
    window.moveTo((screenWidth - newWidth) / 2, screenHeight - newHeight);
  }

  /**
   * 智能分割文本
   * @param {string} text - 要分割的文本
   * @returns {Array} 分割后的文本单元数组
   */
  smartSplitText(text) {
    // 如果文本已经足够短，直接返回
    if (this.getTextWidth(text) <= this.config.maxTextWidth) {
      return [{ text, start: 0, end: text.length }];
    }
    
    // 尝试按句子分割（句号、问号、感叹号）
    const sentenceRegex = /[^。！？!?]+[。！？!?]/g;
    let matches = [...text.matchAll(sentenceRegex)];
    
    if (matches.length > 0) {
      // 检查每个句子是否需要继续拆分
      const units = [];
      let currentPos = 0;
      
      for (const match of matches) {
        const sentence = match[0];
        const start = match.index;
        const end = start + sentence.length;
        
        if (this.getTextWidth(sentence) <= this.config.maxTextWidth) {
          units.push({ text: sentence, start, end });
        } else {
          // 如果句子太长，继续按逗号分割
          const subUnits = this.splitByPunctuation(sentence, start);
          units.push(...subUnits);
        }
        
        currentPos = end;
      }
      
      // 处理最后可能未匹配的部分
      if (currentPos < text.length) {
        const remaining = text.substring(currentPos);
        if (remaining.trim()) {
          if (this.getTextWidth(remaining) <= this.config.maxTextWidth) {
            units.push({
              text: remaining,
              start: currentPos,
              end: text.length
            });
          } else {
            const subUnits = this.splitByPunctuation(remaining, currentPos);
            units.push(...subUnits);
          }
        }
      }
      
      return units;
    }
    
    // 如果没有找到句子，按逗号等标点符号分割
    return this.splitByPunctuation(text, 0);
  }

  /**
   * 按标点符号分割文本
   * @param {string} text - 要分割的文本
   * @param {number} basePosition - 在原始文本中的基础位置
   * @returns {Array} 分割后的文本单元数组
   */
  splitByPunctuation(text, basePosition = 0) {
    const punctRegex = /[^，、；,.;]+[，、；,.;]?/g;
    let matches = [...text.matchAll(punctRegex)];
    const units = [];
    
    if (matches.length > 0) {
      let currentPos = 0;
      
      for (const match of matches) {
        const phrase = match[0];
        const start = basePosition + match.index;
        const end = start + phrase.length;
        
        if (this.getTextWidth(phrase) <= this.config.maxTextWidth) {
          units.push({ text: phrase, start, end });
        } else {
          // 如果按逗号分割还是太长，则强制拆分
          const forceSplitUnits = this.forceSplitText(phrase, start);
          units.push(...forceSplitUnits);
        }
        
        currentPos = match.index + phrase.length;
      }
      
      // 处理最后可能未匹配的部分
      if (currentPos < text.length) {
        const remaining = text.substring(currentPos);
        if (remaining.trim()) {
          if (this.getTextWidth(remaining) <= this.config.maxTextWidth) {
            units.push({
              text: remaining,
              start: basePosition + currentPos,
              end: basePosition + text.length
            });
          } else {
            const forceSplitUnits = this.forceSplitText(remaining, basePosition + currentPos);
            units.push(...forceSplitUnits);
          }
        }
      }
      
      return units;
    }
    
    // 如果没有标点符号，强制拆分
    return this.forceSplitText(text, basePosition);
  }

  /**
   * 强制拆分文本为适合显示的单元
   * @param {string} text - 要拆分的文本
   * @param {number} basePosition - 在原始文本中的基础位置
   * @returns {Array} 拆分后的文本单元数组
   */
  forceSplitText(text, basePosition = 0) {
    const units = [];
    let currentText = "";
    let startPos = 0;
    
    for (let i = 0; i < text.length; i++) {
      currentText += text[i];
      
      // 如果当前文本超出最大宽度，进行拆分
      if (this.getTextWidth(currentText) > this.config.maxTextWidth) {
        // 回退一个字符，确保不超出宽度
        if (currentText.length > 1) {
          currentText = currentText.slice(0, -1);
          i--;
        }
        
        units.push({
          text: currentText,
          start: basePosition + startPos,
          end: basePosition + startPos + currentText.length
        });
        
        currentText = "";
        startPos = i + 1;
      }
    }
    
    // 添加最后一部分
    if (currentText) {
      units.push({
        text: currentText,
        start: basePosition + startPos,
        end: basePosition + text.length
      });
    }
    
    return units;
  }

  /**
   * 从HTML提取文本行
   * @param {string} htmlContent - HTML内容
   * @returns {Array} 提取的文本行数组
   */
  extractLinesFromHTML(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // 收集所有文本节点
    const textNodes = [];
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        textNodes.push(node.textContent.trim());
      }
    }
    
    // 从文本节点中提取行
    let lines = [];
    for (const text of textNodes) {
      const textLines = text.split('\n').map(line => line.trim()).filter(line => line);
      lines = lines.concat(textLines);
    }
    
    return lines;
  }

  /**
   * 清理文本，移除表情符号和特殊字符
   * @param {string} text - 原始文本
   * @returns {string} 清理后的文本
   */
  cleanText(text) {
    return text.replace(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
              .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '')
              .replace(/\s+/g, ' ');
  }

  /**
   * 处理文本，准备显示和朗读
   * @param {string} text - 原始文本
   * @param {string} mdHtml - Markdown解析后的HTML
   * @returns {Object} 处理结果
   */
  processText(text, mdHtml) {
    // 清理文本
    const cleanedText = this.cleanText(text);
    
    // 从Markdown HTML中提取行
    const mdLines = this.extractLinesFromHTML(mdHtml);
    
    // 为每行创建清理后的文本
    const cleanedLines = mdLines.map(line => this.cleanText(line)).filter(line => line);
    
    // 智能分割每行文本
    const displayUnits = [];
    const charToUnitMap = new Array(cleanedText.length).fill(-1);
    let currentPos = 0;
    
    for (let i = 0; i < mdLines.length; i++) {
      const originalLine = mdLines[i];
      const cleanedLine = cleanedLines[i];
      
      if (!cleanedLine) continue;
      
      // 在清理后的文本中找到这行的位置
      const linePos = cleanedText.indexOf(cleanedLine, currentPos);
      
      if (linePos !== -1) {
        // 智能分割这一行
        const units = this.smartSplitText(originalLine);
        
        for (let j = 0; j < units.length; j++) {
          const unit = units[j];
          const unitIndex = displayUnits.length;
          
          // 清理单位文本
          const cleanedUnitText = this.cleanText(unit.text);
          
          // 找到这个单位在清理后文本中的位置
          const unitPos = cleanedText.indexOf(cleanedUnitText, linePos);
          
          if (unitPos !== -1) {
            const unitEnd = unitPos + cleanedUnitText.length;
            
            // 映射这个单位中的每个字符
            for (let k = unitPos; k < unitEnd; k++) {
              charToUnitMap[k] = unitIndex;
            }
            
            displayUnits.push({
              text: unit.text,
              cleanedText: cleanedUnitText,
              start: unitPos,
              end: unitEnd
            });
          }
        }
        
        currentPos = linePos + cleanedLine.length;
      }
    }
    
    return { 
      displayUnits,
      charToUnitMap,
      cleanedText 
    };
  }

  /**
   * 获取匹配的语音
   * @returns {SpeechSynthesisVoice} 找到的语音引擎
   */
  findTargetVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.name.includes(this.config.targetVoiceName)) || 
           voices.find(v => v.lang.includes('zh')) || 
           voices[0];
  }

  /**
   * 语音列表加载完成的回调
   */
  _onVoicesChanged() {
    speechSynthesis.onvoiceschanged = null;
    setTimeout(() => this.startReading(), 500);
  }

  /**
   * 开始朗读
   */
  startReading() {
    const rawText = this.elements.content.textContent;
    const mdHtml = this.elements.content.innerHTML;
    const { displayUnits, charToUnitMap, cleanedText } = this.processText(rawText, mdHtml);
    
    this.showAnimation('loading');
    this.adjustWindowSize("加载中...");
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.voice = this.findTargetVoice();
    utterance.rate = this.config.speechRate;
    utterance.lang = 'zh-CN';
    
    let currentUnitIndex = -1;
    
    utterance.onboundary = (event) => {
      if (event.name !== 'word' && event.name !== 'sentence') return;
      
      const charIndex = event.charIndex || 0;
      if (charIndex < charToUnitMap.length) {
        const unitIndex = charToUnitMap[charIndex];
        
        if (unitIndex !== -1 && unitIndex !== currentUnitIndex) {
          currentUnitIndex = unitIndex;
          
          if (displayUnits[unitIndex]) {
            this.elements.subtitle.innerHTML = displayUnits[unitIndex].text;
            this.adjustWindowSize(displayUnits[unitIndex].text);
          }
        }
      }
    };
    
    utterance.onend = () => {
      this.showAnimation('completion');
      this.adjustWindowSize("完成");
      setTimeout(() => window.close(), this.config.completionDelay);
    };
    
    speechSynthesis.speak(utterance);
  }

  /**
   * 解析并朗读Markdown文本
   * @param {string} markdownText - Markdown格式的文本
   */
  readMarkdown(markdownText) {
    // 需要引入marked库
    if (typeof marked === 'undefined') {
      console.error('需要引入marked库来解析Markdown');
      return;
    }
    
    // 配置marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: true,
      smartLists: true
    });
    
    // 解析markdown
    this.elements.content.innerHTML = marked.parse(markdownText);
    
    // 显示加载动画
    this.showAnimation('loading');
    
    // 初始化窗口位置和大小
    const screenHeight = window.screen.availHeight;
    window.resizeTo(this.config.minWindowWidth, this.config.singleLineHeight);
    window.moveTo((window.screen.availWidth - this.config.minWindowWidth) / 2, screenHeight - this.config.singleLineHeight);
    
    // 等待语音引擎加载
    if (speechSynthesis.getVoices().length) {
      setTimeout(() => this.startReading(), 500);
    } else {
      speechSynthesis.onvoiceschanged = this._onVoicesChanged;
    }
  }

  /**
   * 直接朗读文本（不解析Markdown）
   * @param {string} text - 要朗读的文本
   */
  readText(text) {
    this.elements.content.textContent = text;
    
    // 显示加载动画
    this.showAnimation('loading');
    
    // 初始化窗口位置和大小
    const screenHeight = window.screen.availHeight;
    window.resizeTo(this.config.minWindowWidth, this.config.singleLineHeight);
    window.moveTo((window.screen.availWidth - this.config.minWindowWidth) / 2, screenHeight - this.config.singleLineHeight);
    
    // 等待语音引擎加载
    if (speechSynthesis.getVoices().length) {
      setTimeout(() => this.startReading(), 500);
    } else {
      speechSynthesis.onvoiceschanged = this._onVoicesChanged;
    }
  }

  /**
   * 初始化库
   * @param {string} [text] - 可选的要朗读的文本
   * @param {boolean} [isMarkdown=false] - 文本是否为Markdown格式
   */
  init(text, isMarkdown = false) {
    // 处理页面关闭事件
    window.addEventListener('beforeunload', () => {
      speechSynthesis.cancel();
    });
    
    if (text) {
      if (isMarkdown) {
        this.readMarkdown(text);
      } else {
        this.readText(text);
      }
    }
  }
}

// 默认CSS样式
const SmartSubtitleReaderStyles = `
html, body {
  margin: 0;
  padding: 0;
  background-color: #181818;
  color: white;
  font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
  overflow: hidden;
  width: 100%;
  height: 100%;
}
#subtitle {
  font-size: 22px;
  line-height: 1.3;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.single-line { white-space: nowrap; }
.multi-line {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.hidden-content { display: none; }

/* 动画样式 */
.animation-container { display: flex; }
.animation-item { margin: 0 3px; background-color: white; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.3;
  animation: dot-bounce 1.4s infinite ease-in-out both;
}
.bar {
  width: 4px;
  height: 16px;
  opacity: 0.4;
  animation: bar-wave 1.2s infinite ease-in-out both;
}
.dot:nth-child(1), .bar:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2), .bar:nth-child(2) { animation-delay: -0.16s; }
.dot:nth-child(3), .bar:nth-child(3) { animation-delay: 0s; }
.dot:nth-child(4), .bar:nth-child(4) { animation-delay: 0.16s; }
.dot:nth-child(5), .bar:nth-child(5) { animation-delay: 0.32s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-8px); opacity: 1; }
}
@keyframes bar-wave {
  0%, 40%, 100% { transform: scaleY(0.4); }
  20% { transform: scaleY(1); opacity: 1; }
}
`;

// 简单示例HTML
const SmartSubtitleReaderHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>字幕伴读</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="smart-subtitle-reader.js"></script>
  <style id="subtitle-reader-styles"></style>
</head>
<body>
  <div id="subtitle" class="single-line"></div>
  <div id="content" class="hidden-content"></div>
  <script>
    // 添加样式
    document.getElementById('subtitle-reader-styles').textContent = SmartSubtitleReaderStyles;
    
    // 创建阅读器实例
    const reader = new SmartSubtitleReader({
      // 可选配置
      speechRate: 1.0,
      targetVoiceName: "Microsoft Yunyang Online"
    });
    
    // 初始化并朗读Markdown
    const markdownText = `这是一段示例文本
可以包含多行
甚至可以是很长的句子，系统会自动根据窗口大小和文本长度智能拆分成合适的显示单元`;
    
    reader.init(markdownText, true);
  </script>
</body>
</html>
`;

/**
 * 使用说明:
 * 
 * 1. 引入必要的库:
 *    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
 *    <script src="smart-subtitle-reader.js"></script>
 * 
 * 2. 添加必要的HTML元素:
 *    <div id="subtitle" class="single-line"></div>
 *    <div id="content" class="hidden-content"></div>
 * 
 * 3. 添加样式:
 *    <style>
 *      // 复制 SmartSubtitleReaderStyles 中的样式
 *    </style>
 * 
 * 4. 创建实例并初始化:
 *    const reader = new SmartSubtitleReader();
 *    reader.init('要朗读的文本', true); // 第二个参数表示是否为Markdown
 * 
 * 智能字幕规则:
 * 1. 短文本直接显示
 * 2. 长文本首先尝试按句号、问号、感叹号分割
 * 3. 如果分割后的句子仍然过长，尝试按逗号、分号等分割
 * 4. 如果所有分割都不足以保证显示效果，强制按字符分割
 */
