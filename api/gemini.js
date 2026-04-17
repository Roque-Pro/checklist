export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada' });
    }

    try {
        const { contents, generationConfig } = req.body;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents, generationConfig })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ ...data, model });
        }

        return res.status(200).json({ ...data, model });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
