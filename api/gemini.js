const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash-lite'];
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseModelList(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function getRetryDelayMs(data, attemptIndex) {
    const retryDelay = data?.error?.details?.find(detail => detail?.retryDelay)?.retryDelay;
    if (retryDelay) {
        const seconds = Number.parseInt(String(retryDelay).replace(/[^\d]/g, ''), 10);
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    }

    const backoff = [1200, 2500, 4500, 7000];
    return backoff[Math.min(attemptIndex, backoff.length - 1)];
}

async function callGeminiModel({ apiKey, model, contents, generationConfig }) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig })
        }
    );

    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        data = {};
    }

    return { response, data, model };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo nao permitido' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY nao configurada' });
    }

    const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const fallbackModels = parseModelList(process.env.GEMINI_FALLBACK_MODELS);
    const candidateModels = [...new Set([primaryModel, ...fallbackModels, ...DEFAULT_FALLBACK_MODELS])];

    try {
        const { contents, generationConfig } = req.body;
        let lastFailure = null;

        for (const model of candidateModels) {
            const maxAttempts = model === primaryModel ? 3 : 2;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const { response, data } = await callGeminiModel({
                    apiKey,
                    model,
                    contents,
                    generationConfig
                });

                if (response.ok) {
                    return res.status(200).json({
                        ...data,
                        model,
                        attemptsUsed: attempt + 1
                    });
                }

                lastFailure = { response, data, model, attempt };

                if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts - 1) {
                    break;
                }

                await sleep(getRetryDelayMs(data, attempt));
            }
        }

        if (lastFailure) {
            const { response, data, model } = lastFailure;
            const status = response.status;
            const message = data?.error?.message || 'Falha na chamada da Gemini.';

            return res.status(status).json({
                ...data,
                model,
                fallbackModelsTried: candidateModels,
                userMessage: status === 503
                    ? 'A Gemini esta com alta demanda no momento. O sistema tentou novamente e tambem testou um modelo alternativo.'
                    : message
            });
        }

        return res.status(500).json({ error: 'Falha inesperada ao chamar a Gemini.' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
