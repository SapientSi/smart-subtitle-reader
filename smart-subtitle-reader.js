/**
 * SmartSubtitle.js
 * 智能字幕显示规则库
 * 用于智能拆分和显示字幕文本
 */

(function(global) {
    'use strict';
    
    /**
     * SmartSubtitle主类
     */
    class SmartSubtitle {
        /**
         * 创建SmartSubtitle实例
         * @param {Object} options 配置选项
         */
        constructor(options = {}) {
            // 默认配置
            this.config = {
                maxLineWidth: 800,           // 单行最大宽度(像素)
                fontSize: 22,                // 字体大小(像素)
                fontFamily: "Microsoft YaHei UI, Segoe UI, sans-serif", // 字体系列
                cleanEmoji: true,            // 是否清理表情符号
                cleanSpecialChars: true,     // 是否清理特殊字符
                normalizeSpaces: true,       // 是否规范化空格
                ...options
            };
            
            // 创建文本测量用的canvas
            this._setupTextMeasurement();
        }
        
        /**
         * 设置文本测量Canvas
         * @private
         */
        _setupTextMeasurement() {
            this.canvas = document.createElement('canvas');
            this.context = this.canvas.getContext('2d');
            this.context.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        }
        
        /**
         * 测量文本宽度
         * @param {string} text 要测量的文本
         * @returns {number} 文本宽度(像素)
         */
        measureTextWidth(text) {
            return this.context.measureText(text).width;
        }
        
        /**
         * 清理文本(移除表情符号和特殊字符)
         * @param {string} text 待清理的文本
         * @returns {string} 清理后的文本
         */
        cleanText(text) {
            let result = text;
            
            if (this.config.cleanEmoji) {
                // 移除表情符号 (Unicode范围)
                result = result.replace(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
            }
            
            if (this.config.cleanSpecialChars) {
                // 移除不是字母、数字、标点或空白的字符
                result = result.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '');
            }
            
            if (this.config.normalizeSpaces) {
                // 规范化空白字符
                result = result.replace(/\s+/g, ' ');
            }
            
            return result;
        }
        
        /**
         * 从Markdown/HTML内容中提取文本行
         * @param {string} htmlContent HTML内容
         * @returns {string[]} 提取的文本行数组
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
                const textLines = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line);
                lines = lines.concat(textLines);
            }
            
            return lines;
        }
        
        /**
         * 智能分割文本单元
         * @param {string} text 待分割的文本
         * @returns {Object[]} 分割后的文本单元数组，每个单元包含text和位置信息
         */
        smartSplitText(text) {
            // 如果文本已经足够短，直接返回
            if (this.measureTextWidth(text) <= this.config.maxLineWidth) {
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
                    
                    if (this.measureTextWidth(sentence) <= this.config.maxLineWidth) {
                        units.push({
                            text: sentence,
                            start,
                            end
                        });
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
                        if (this.measureTextWidth(remaining) <= this.config.maxLineWidth) {
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
         * @param {string} text 待分割的文本
         * @param {number} basePosition 基础位置偏移
         * @returns {Object[]} 分割后的文本单元数组
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
                    
                    if (this.measureTextWidth(phrase) <= this.config.maxLineWidth) {
                        units.push({
                            text: phrase,
                            start,
                            end
                        });
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
                        if (this.measureTextWidth(remaining) <= this.config.maxLineWidth) {
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
         * 强制拆分文本（按字符数量）
         * @param {string} text 待拆分的文本
         * @param {number} basePosition 基础位置偏移
         * @returns {Object[]} 拆分后的文本单元数组
         */
        forceSplitText(text, basePosition = 0) {
            const units = [];
            let currentText = "";
            let startPos = 0;
            
            for (let i = 0; i < text.length; i++) {
                currentText += text[i];
                
                // 如果当前文本超出最大宽度，进行拆分
                if (this.measureTextWidth(currentText) > this.config.maxLineWidth) {
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
         * 处理并准备字幕文本
         * @param {string} rawText 原始文本
         * @param {string} mdHtml 解析后的HTML(可选)
         * @returns {Object} 处理后的字幕数据，包含显示单元和字符映射
         */
        processSubtitleText(rawText, mdHtml = null) {
            // 清理文本
            const cleanedText = this.cleanText(rawText);
            
            // 获取行
            let mdLines = [];
            if (mdHtml) {
                mdLines = this.extractLinesFromHTML(mdHtml);
            } else {
                mdLines = rawText.split('\n').map(line => line.trim()).filter(line => line);
            }
            
            // 清理每行
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
         * 根据字符位置获取当前显示单元
         * @param {number} charIndex 字符索引
         * @param {Array} charToUnitMap 字符到单元的映射
         * @param {Array} displayUnits 显示单元数组
         * @returns {Object|null} 当前应显示的单元，如果未找到则返回null
         */
        getCurrentUnit(charIndex, charToUnitMap, displayUnits) {
            if (charIndex < charToUnitMap.length) {
                const unitIndex = charToUnitMap[charIndex];
                if (unitIndex !== -1 && unitIndex < displayUnits.length) {
                    return displayUnits[unitIndex];
                }
            }
            return null;
        }

        /**
         * 更新配置
         * @param {Object} newConfig 新配置
         */
        updateConfig(newConfig) {
            this.config = {...this.config, ...newConfig};
            this._setupTextMeasurement();
        }
    }
    
    // 暴露给全局或作为模块导出
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = SmartSubtitle;
    } else {
        global.SmartSubtitle = SmartSubtitle;
    }
    
})(typeof window !== 'undefined' ? window : this);
