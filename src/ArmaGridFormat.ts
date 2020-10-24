const CHARS = 'ABCDEFGHIJ';

/**
 * Replaces given char at given index in given string
 * @param {string} str String to replace char in
 * @param {number} index Index of char to replace
 * @param {string} chr New char
 * @returns {string} New string with replaced char
 */
function setCharAt(str: string, index: number, chr: string) {
    if(index > str.length-1) return str;
    return str.substring(0,index) + chr + str.substring(index+1);
}

interface DigitPosition {
    strIndex: number,
    value: number,
    isChar: boolean
}

export default class ArmaGridFormat {
    private formatStr: string;
    private max: number;
    private digitPositions: DigitPosition[];


    /**
     * @param {string} formatStr Grid format string
     */
    constructor(formatStr: string) {
        this.formatStr = formatStr;

        const digitPositions = [];

        const matches = formatStr.matchAll(/[A-J]|[0-9]/g);
        for (const match of matches) {
            const char = match[0];

            const index = CHARS.indexOf(char);
            const value = (index > -1) ? index : Number.parseInt(char, 10);

            digitPositions.push({
                strIndex: match.index!,
                value,
                isChar: index > -1
            });
        }

        this.digitPositions = digitPositions;
        this.max = Math.pow(10, digitPositions.length);
    }

    /**
     * Format number with given grid format
     * @param {number} num Number
     * @returns {string} formated number
     */
    formatGridNumber(num: number): string {
        const mod = num % this.max;
        let numToFormat = num >= 0 ? mod : this.max + mod;
    
        // split the number into digits
        const digits = [];
        while (numToFormat > 0) {
            const digit = numToFormat % 10;
            digits.push(digit);
            numToFormat = (numToFormat - digit) / 10;
        }
        while (digits.length < this.digitPositions.length) {
            digits.push(0);
        }
        digits.reverse();
    
        let str = this.formatStr;
        for (let i = 0; i < this.digitPositions.length && i < digits.length; i++) {
            const { strIndex, value, isChar } = this.digitPositions[i];
            const newValue = (value + digits[i]) % 10;

            const newChar = isChar ? CHARS.charAt(newValue) : newValue.toString();
            str = setCharAt(str, strIndex, newChar) 
        }

        return str;
    }
}
