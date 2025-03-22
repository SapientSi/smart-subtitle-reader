/***SubtitleReader - 字幕伴读库
 * 一个轻量级的JavaScript库，提供文本朗读功能，并伴随同步的字幕显示
 */
class SubtitleReader {
  /**
   * 创建新的SubtitleReader实例
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    // 默认配置
    this.config = {
      container: null,
      markdownText: '',
      targetVoiceName: "Microsoft Yunxi Online",
      speechRate: 1.0,
      minWindowWidth: Math.floor(window.screen.availWidth * 0.3),
      maxWindowWidth: Math.floor(window.screen.availWidth * 0.9),
      singleLineHeight: 35,
      multiLineHeight: 70,
      completionDelay: 2000,
      maxTextWidth: Math.floor(window.screen.availWidth * 0.8),
      standalone: false, // 是否控制窗口大小(独立窗口模式应设为true)
      ...options
    };
    // 初始化状态
    this.elements = {
      subtitle: null,
      content: null
    };
    // 创建文本测量画布
    this.textCanvas = document.createElement("canvas");
    this.textContext = this.textCanvas.getContext("2d");
    this.textContext.font = "22px Microsoft YaHei UI, Segoe UI, sans-serif";
    // 如果提供了容器，则初始化
    if (this.config.container) {
      this.init();
    }
  }
  /**
   * 初始化阅读器
   * @param {HTMLElement|string} container - 容器元素或选择器
   */
  init(container) {
    if (container) {
      this.config.container = container;
    }
    // 获取容器元素
    if (typeof this.config.container === 'string') {
      this.config.container = document.querySelector(this.config.container);
    }
    if (!this.config.container) {
      throw new Error('SubtitleReader: 未提供容器元素');
    }
    // 创建DOM结构
    this.createDOM();
    // 设置事件监听
    this.setupEvents();
    // 如果提供了文本，则初始化内容
    if (this.config.markdownText) {
      this.setText(this.config.markdownText);
    }
  }
  /**
   * 创建DOM结构
   */
  createDOM() {
    // 创建字幕元素
    this.elements.subtitle = document.createElement('div');
    this.elements.subtitle.id = 'subtitle';
    this.elements.subtitle.className = 'single-line';
    // 创建隐藏内容元素
    this.elements.content = document.createElement('div');
    this.elements.content.id = 'content';
    this.elements.content.className = 'hidden-content';
    // 将元素添加到容器
    this.config.container.appendChild(this.elements.subtitle);
    this.config.container.appendChild(this.elements.content);
  }
  /**
   * 设置事件监听
   */
  setupEvents() {
    // 页面关闭事件
    window.addEventListener('beforeunload', () => {
      speechSynthesis.cancel();
    });
  }
  /**
   * 设置文本内容并开始朗读
   * @param {string} text - 要朗读的Markdown文本
   */
  setText(text) {
    this.config.markdownText = text;
    if (!window.marked) {
      console.error('SubtitleReader: 需要marked.js库来解析markdown');
      return;
    }
    // 解析markdown
    this.elements.content.innerHTML = marked.parse(this.config.markdownText);
    // 显示加载动画
    this.showAnimation('loading');
    // 独立窗口模式调整窗口大小
    if (this.config.standalone) {
      const screenHeight = window.screen.availHeight;
      window.resizeTo(this.config.minWindowWidth, this.config.singleLineHeight);
      window.moveTo((window.screen.availWidth - this.config.minWindowWidth) / 2, screenHeight - this.config.singleLineHeight);
    }
    // 语音可用时开始朗读
    if (speechSynthesis.getVoices().length) {
      setTimeout(() => this.startReading(), 500);
    } else {
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.onvoiceschanged = null;
        setTimeout(() => this.startReading(), 500);
      };
    }
  }
  /**
   * 在字幕元素中显示动画
   * @param {string} type - 动画类型 ('loading' 或 'completion')
   */
  showAnimation(type) {
    const itemClass = type === 'loading' ? 'dot' : 'bar';
    const items = Array(5).fill(`<div class="animation-item ${itemClass}"></div>`).join('');
    this.elements.subtitle.innerHTML = `<div class="animation-container">${items}</div>`;
  }
  /**
   * 获取文本宽度
   * @param {string} text - 要测量的文本
   * @returns {number} - 文本的宽度
   */
  getTextWidth(text) {
    return this.textContext.measureText(text).width + 60;
  }
  /**
   * 过滤URL和表情符号，但保持文本长度（用于朗读处理）
   * @param {string} text - 要过滤的文本
   * @returns {string} - 过滤后的文本，URL位置用空格占位
   */
  filterTextKeepLength(text) {
    // 更全面的URL过滤
    return text
      // 处理http/https链接
      .replace(/https?:\/\/[^\s]+/g, match => ' '.repeat(match.length))
      // 处理www开头的网址
      .replace(/www\.[^\s]+/g, match => ' '.repeat(match.length))
      // 处理常见域名格式 (xxx.com, xxx.net等)
      .replace(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?[^\s]*/g, match => ' '.repeat(match.length))
      // 处理邮箱地址
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, match => ' '.repeat(match.length))
      // 过滤所有表情符号和特殊Unicode字符
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/gu, '')
      // 过滤其他特殊字符，但保留基本标点和空格
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{M}]/gu, '')
      // 规范化空格
      .replace(/\s+/g, ' ');
  }
  /**
   * 完全过滤URL和表情符号（用于显示处理）
   * @param {string} text - 要过滤的文本
   * @returns {string} - 完全过滤后的文本
   */
  filterTextComplete(text) {
    // 更全面的URL过滤
    return text
      // 处理http/https链接
      .replace(/https?:\/\/[^\s]+/g, '')
      // 处理www开头的网址
      .replace(/www\.[^\s]+/g, '')
      // 处理常见域名格式 (xxx.com, xxx.net等)
      .replace(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?[^\s]*/g, '')
      // 处理邮箱地址
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      // 过滤所有表情符号和特殊Unicode字符
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/gu, '')
      // 过滤其他特殊字符，但保留基本标点和空格
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{M}]/gu, '')
      // 规范化空格并修剪
      .replace(/\s+/g, ' ')
      .trim();
  }
  /**
   * 智能分割文本
   * @param {string} text - 要分割的文本
   * @returns {Array} - 文本单元数组
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
          units.push({
            text: sentence,
            start,
            end
          });
        } else {
          // 如果句子太长，按标点符号分割
          const subUnits = this.splitByPunctuation(sentence, start);
          units.push(...subUnits);
        }
        currentPos = end;
      }
      // 处理剩余文本
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
    // 如果找不到句子，按标点符号分割
    return this.splitByPunctuation(text, 0);
  }
  /**
   * 按标点符号分割文本
   * @param {string} text - 要分割的文本
   * @param {number} basePosition - 原始文本中的基础位置
   * @returns {Array} - 文本单元数组
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
          units.push({
            text: phrase,
            start,
            end
          });
        } else {
          // 如果短语仍然太长，强制分割
          const forceSplitUnits = this.forceSplitText(phrase, start);
          units.push(...forceSplitUnits);
        }
        currentPos = match.index + phrase.length;
      }
      // 处理剩余文本
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
    // 如果没有标点符号，强制分割
    return this.forceSplitText(text, basePosition);
  }
  /**
   * 强制按长度分割文本
   * @param {string} text - 要分割的文本
   * @param {number} basePosition - 原始文本中的基础位置
   * @returns {Array} - 文本单元数组
   */
  forceSplitText(text, basePosition = 0) {
    const units = [];
    let currentText = "";
    let startPos = 0;
    for (let i = 0; i < text.length; i++) {
      currentText += text[i];
      // 如果当前文本超出最大宽度，分割
      if (this.getTextWidth(currentText) > this.config.maxTextWidth) {
        // 回退一个字符确保不超出宽度
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
   * 从HTML中提取文本行
   * @param {string} htmlContent - HTML内容
   * @returns {Array} - 文本行数组
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
   * 处理文本准备朗读
   * @param {string} text - 原始文本
   * @param {string} mdHtml - Markdown HTML
   * @returns {Object} - 处理后的文本数据
   */
  processText(text, mdHtml) {
    // 从Markdown HTML中提取行
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = mdHtml;
    // 收集和过滤所有文本节点
    const textLines = [];
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        // 提取行
        const lines = node.textContent.trim()
          .split('\n')
          .map(line => line.trim())
          .filter(line => line);
        textLines.push(...lines);
      }
    }
    // 处理朗读用文本 - 保留URL位置但用空格代替
    const readingLines = textLines.map(line => {
      return this.filterTextKeepLength(line);
    });
    // 处理显示用文本 - 完全移除URL
    const displayLines = textLines.map(line => {
      return this.filterTextComplete(line);
    });
    // 合并处理后的朗读文本
    const cleanedText = readingLines.join(' ');
    // 创建显示单元和字符映射
    const displayUnits = [];
    const charToUnitMap = new Array(cleanedText.length).fill(-1);
    let currentPos = 0;
    for (let i = 0; i < displayLines.length; i++) {
      const displayLine = displayLines[i];
      const readingLine = readingLines[i];
      if (!displayLine) continue;
      // 智能分割显示行
      const units = this.smartSplitText(displayLine);
      for (let j = 0; j < units.length; j++) {
        const unit = units[j];
        const unitIndex = displayUnits.length;
        // 在朗读文本中找到对应的部分
        // 注意：我们在这里寻找的是可能包含空格占位符的朗读文本
        const unitPos = cleanedText.indexOf(readingLine, currentPos);
        if (unitPos !== -1) {
          // 计算单元文本的结束位置
          const unitEnd = unitPos + readingLine.length;
          // 映射这个单位中的每个字符
          for (let k = unitPos; k < unitEnd; k++) {
            charToUnitMap[k] = unitIndex;
          }
          displayUnits.push({
            text: unit.text, // 使用已经完全过滤URL的文本用于显示
            start: unitPos,
            end: unitEnd
          });
          // 更新当前位置
          currentPos = unitEnd;
        }
      }
    }
    return {
      displayUnits,
      charToUnitMap,
      cleanedText
    };
  }
  /**
   * 查找目标语音
   * @returns {SpeechSynthesisVoice} - 选定的语音
   */
  findTargetVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.name.includes(this.config.targetVoiceName)) ||
           voices.find(v => v.lang.includes('zh')) ||
           voices[0];
  }
  /**
   * 根据文本宽度调整窗口大小
   * @param {string} text - 要显示的文本
   */
  adjustWindowSize(text) {
    if (!this.config.standalone) return;
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
   * 开始朗读文本
   */
  startReading() {
    const rawText = this.elements.content.textContent;
    const mdHtml = this.elements.content.innerHTML;
    const { displayUnits, charToUnitMap, cleanedText } = this.processText(rawText, mdHtml);
    this.showAnimation('loading');
    this.adjustWindowSize("加载中...");
    speechSynthesis.cancel();
    // 使用已经过滤URL的文本创建语音对象
    const utterance = new SpeechSynthesisUtterance(this.filterTextComplete(cleanedText));
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
      if (this.config.standalone) {
        setTimeout(() => window.close(), this.config.completionDelay);
      }
      // 触发完成事件
      const event = new CustomEvent('reading-complete');
      this.config.container.dispatchEvent(event);
    };
    speechSynthesis.speak(utterance);
    // 触发开始事件
    const event = new CustomEvent('reading-start');
    this.config.container.dispatchEvent(event);
  }
  /**
   * 停止朗读
   */
  stopReading() {
    speechSynthesis.cancel();
    this.showAnimation('completion');
  }
}
// 在浏览器环境中暴露给window对象
if (typeof window !== 'undefined') {
  window.SubtitleReader = SubtitleReader;
}
// 为模块系统导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleReader;
}
