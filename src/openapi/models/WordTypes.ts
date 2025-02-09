/* tslint:disable */
/* eslint-disable */
/**
 * DUMMY Engine
 * DUMMY の音声合成エンジンです。
 *
 * The version of the OpenAPI document: latest
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


/**
 * 品詞
 * @export
 */
export const WordTypes = {
    ProperNoun: 'PROPER_NOUN',
    CommonNoun: 'COMMON_NOUN',
    Verb: 'VERB',
    Adjective: 'ADJECTIVE',
    Suffix: 'SUFFIX'
} as const;
export type WordTypes = typeof WordTypes[keyof typeof WordTypes];


export function WordTypesFromJSON(json: any): WordTypes {
    return WordTypesFromJSONTyped(json, false);
}

export function WordTypesFromJSONTyped(json: any, ignoreDiscriminator: boolean): WordTypes {
    return json as WordTypes;
}

export function WordTypesToJSON(value?: WordTypes | null): any {
    return value as any;
}

