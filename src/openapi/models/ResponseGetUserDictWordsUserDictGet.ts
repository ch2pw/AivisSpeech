/* tslint:disable */
/* eslint-disable */
/**
 * AivisSpeech Engine
 * AivisSpeech の音声合成エンジンです。
 *
 * The version of the OpenAPI document: latest
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { exists, mapValues } from '../runtime';
import type { UserDictWord } from './UserDictWord';
import {
    UserDictWordFromJSON,
    UserDictWordFromJSONTyped,
    UserDictWordToJSON,
} from './UserDictWord';
import type { UserDictWordForCompat } from './UserDictWordForCompat';
import {
    UserDictWordForCompatFromJSON,
    UserDictWordForCompatFromJSONTyped,
    UserDictWordForCompatToJSON,
} from './UserDictWordForCompat';
import type { WordTypes } from './WordTypes';
import {
    WordTypesFromJSON,
    WordTypesFromJSONTyped,
    WordTypesToJSON,
} from './WordTypes';

/**
 * 
 * @export
 * @interface ResponseGetUserDictWordsUserDictGet
 */
export interface ResponseGetUserDictWordsUserDictGet {
    /**
     * 表層形
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    surface: any | null;
    /**
     * 優先度
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    priority: any | null;
    /**
     * 文脈 ID
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    contextId?: any | null;
    /**
     * 品詞
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    partOfSpeech: any | null;
    /**
     * 品詞細分類1
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    partOfSpeechDetail1: any | null;
    /**
     * 品詞細分類2
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    partOfSpeechDetail2: any | null;
    /**
     * 品詞細分類3
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    partOfSpeechDetail3: any | null;
    /**
     * 品詞種別
     * @type {WordTypes}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    wordType?: WordTypes;
    /**
     * 活用型
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    inflectionalType: any | null;
    /**
     * 活用形
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    inflectionalForm: any | null;
    /**
     * 原形
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    stem: any | null;
    /**
     * 読み
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    yomi: any | null;
    /**
     * 発音
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    pronunciation: any | null;
    /**
     * アクセント型
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    accentType: any | null;
    /**
     * モーラ数
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    moraCount?: any | null;
    /**
     * アクセント結合規則
     * @type {any}
     * @memberof ResponseGetUserDictWordsUserDictGet
     */
    accentAssociativeRule: any | null;
}

/**
 * Check if a given object implements the ResponseGetUserDictWordsUserDictGet interface.
 */
export function instanceOfResponseGetUserDictWordsUserDictGet(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "surface" in value;
    isInstance = isInstance && "priority" in value;
    isInstance = isInstance && "partOfSpeech" in value;
    isInstance = isInstance && "partOfSpeechDetail1" in value;
    isInstance = isInstance && "partOfSpeechDetail2" in value;
    isInstance = isInstance && "partOfSpeechDetail3" in value;
    isInstance = isInstance && "inflectionalType" in value;
    isInstance = isInstance && "inflectionalForm" in value;
    isInstance = isInstance && "stem" in value;
    isInstance = isInstance && "yomi" in value;
    isInstance = isInstance && "pronunciation" in value;
    isInstance = isInstance && "accentType" in value;
    isInstance = isInstance && "accentAssociativeRule" in value;

    return isInstance;
}

export function ResponseGetUserDictWordsUserDictGetFromJSON(json: any): ResponseGetUserDictWordsUserDictGet {
    return ResponseGetUserDictWordsUserDictGetFromJSONTyped(json, false);
}

export function ResponseGetUserDictWordsUserDictGetFromJSONTyped(json: any, ignoreDiscriminator: boolean): ResponseGetUserDictWordsUserDictGet {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'surface': json['surface'],
        'priority': json['priority'],
        'contextId': !exists(json, 'context_id') ? undefined : json['context_id'],
        'partOfSpeech': json['part_of_speech'],
        'partOfSpeechDetail1': json['part_of_speech_detail_1'],
        'partOfSpeechDetail2': json['part_of_speech_detail_2'],
        'partOfSpeechDetail3': json['part_of_speech_detail_3'],
        'wordType': !exists(json, 'word_type') ? undefined : WordTypesFromJSON(json['word_type']),
        'inflectionalType': json['inflectional_type'],
        'inflectionalForm': json['inflectional_form'],
        'stem': json['stem'],
        'yomi': json['yomi'],
        'pronunciation': json['pronunciation'],
        'accentType': json['accent_type'],
        'moraCount': !exists(json, 'mora_count') ? undefined : json['mora_count'],
        'accentAssociativeRule': json['accent_associative_rule'],
    };
}

export function ResponseGetUserDictWordsUserDictGetToJSON(value?: ResponseGetUserDictWordsUserDictGet | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'surface': value.surface,
        'priority': value.priority,
        'context_id': value.contextId,
        'part_of_speech': value.partOfSpeech,
        'part_of_speech_detail_1': value.partOfSpeechDetail1,
        'part_of_speech_detail_2': value.partOfSpeechDetail2,
        'part_of_speech_detail_3': value.partOfSpeechDetail3,
        'word_type': WordTypesToJSON(value.wordType),
        'inflectional_type': value.inflectionalType,
        'inflectional_form': value.inflectionalForm,
        'stem': value.stem,
        'yomi': value.yomi,
        'pronunciation': value.pronunciation,
        'accent_type': value.accentType,
        'mora_count': value.moraCount,
        'accent_associative_rule': value.accentAssociativeRule,
    };
}

