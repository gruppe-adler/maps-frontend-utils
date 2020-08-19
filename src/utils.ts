import { ResponseError } from './types';

let API_URI = location.origin;

/**
 * Set maps api uri
 * @param url maps api uri
 */
export function setApiUri(url: string) {
    API_URI = url;
};

/**
 * Get maps api uri
 * @returns maps uri
 */
export function getApiUri(): string {
    return API_URI;
};


export function relativeUrl(path: string): string {
    return `${API_URI}/${path}`;
};

export async function fetchJSON<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
    let response: Response;

    try {
        response = await fetch(input, init);
    } catch (err) {
        throw err;
    }

    if (!response.ok) throw new ResponseError(response);

    return response.json();
};
