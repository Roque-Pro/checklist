// Laudo de Inspeção Veicular - Com IA Gemini
class LaudoApp {
    constructor() {
        this.sidePhotos = { left: null, right: null, front: null, back: null };
        this.panelPhotos = { lights: null, full: null, trunk: null };
        this.extraPhotos = [];
        this.docProprietarioPhoto = null;
        this.isAnalyzingDoc = false;
        this.isAnalyzingVehicle = false;
        this.lastVehicleAnalysisSignature = '';
        this.checklistStatus = {};
        this.checklistItems = [];
        this.proprietarioData = {};
        this.vehicleData = {};
        this.DRAFT_KEY = 'laudo_current';
        this.init();
    }

    init() {
        this.setupGlobalErrorHandlers();
        this.setupEventListeners();
        this.setupSignatureCanvases();
        this.setupAutoAnalysisUI();
        this.loadDraft();
    }

    capitalizeKey(value) {
        if (typeof value !== 'string' || !value) return '';
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    setupAutoAnalysisUI() {
        ['btnAnalisarProprietario', 'btnAnalisarVeiculo'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.style.display = 'none';
        });
    }

    // ═══════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════
    setupEventListeners() {
        // Foto documento proprietário
        document.getElementById('btnFotoDocProprietario').addEventListener('click', () => {
            document.getElementById('photoDocProprietario').click();
        });
        document.getElementById('photoDocProprietario').addEventListener('change', (e) => this.handleDocProprietarioPhoto(e));
        document.getElementById('btnAnalisarProprietario').addEventListener('click', () => this.analyzeProprietarioDoc());
        document.getElementById('manualProprietario').addEventListener('click', () => this.showManualProprietario());

        // Fotos do veículo
        document.querySelectorAll('.btn-photo[data-side]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const side = e.currentTarget.dataset.side;
                if (!side) return;
                const input = document.getElementById(`photo${this.capitalizeKey(side)}`);
                if (input) input.click();
            });
        });
        document.querySelectorAll('.photo-input').forEach(input => {
            input.addEventListener('change', (e) => this.handleVehiclePhoto(e));
        });
        document.querySelectorAll('.btn-panel-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const panel = e.currentTarget.dataset.panel;
                if (!panel) return;
                const inputId = {
                    lights: 'photoPanelLights',
                    full: 'photoPanelFull',
                    trunk: 'photoTrunk'
                }[panel];
                const input = document.getElementById(inputId);
                if (input) input.click();
            });
        });
        document.querySelectorAll('.panel-photo-input').forEach(input => {
            input.addEventListener('change', (e) => this.handlePanelPhoto(e));
        });
        document.getElementById('btnAnalisarVeiculo').addEventListener('click', () => this.analyzeVehicle());
        document.getElementById('manualVeiculo').addEventListener('click', () => this.showManualVehicle());

        // Fotos extras
        document.getElementById('btnAddExtraPhoto').addEventListener('click', () => {
            document.getElementById('extraPhotoInput').click();
        });
        document.getElementById('extraPhotoInput').addEventListener('change', (e) => this.handleExtraPhoto(e));

        // Ação
        document.getElementById('saveDraftBtn').addEventListener('click', () => this.saveDraft());
        document.getElementById('loadDraftBtn').addEventListener('click', () => this.clearForm());
        document.getElementById('generatePdfBtn').addEventListener('click', () => this.generatePDF());

        // Auto-save nos campos fixos
        ['operador', 'observations', 'companyName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.autoSave());
            }
        });
    }

    // ═══════════════════════════════════════
    // PROPRIETÁRIO - FOTO + IA
    // ═══════════════════════════════════════
    async handleDocProprietarioPhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const optimizedPhoto = await this.prepareImageForUpload(file, {
                maxWidth: 1600,
                maxHeight: 1600,
                quality: 0.84,
                minQuality: 0.6,
                targetMaxBytes: 320000,
                mode: 'document'
            });
            const qualityCheck = this.assessImageQuality(optimizedPhoto, { mode: 'document' });
            this.docProprietarioPhoto = optimizedPhoto;
            document.getElementById('previewDocProprietario').innerHTML = `<img src="${optimizedPhoto}" alt="Documento">`;
            document.getElementById('btnAnalisarProprietario').style.display = 'none';
            if (!qualityCheck.ok) {
                this.showModal(`Nao consegui validar a foto do documento.\n\nMotivo: ${qualityCheck.reason}\n\nTente novamente com o documento inteiro visivel, sem reflexo e sem tremido.`);
            } else {
                this.showMessage('Documento otimizado e enviado para leitura.', 'success');
                this.analyzeProprietarioDoc();
            }
        } catch (error) {
            this.showErrorModal('Erro ao preparar foto do documento', error);
        }
        e.target.value = '';
    }

    async analyzeProprietarioDoc() {
        if (!this.docProprietarioPhoto || this.isAnalyzingDoc) return;
        const loading = document.getElementById('loadingProprietario');
        const btn = document.getElementById('btnAnalisarProprietario');
        this.isAnalyzingDoc = true;
        btn.style.display = 'none';
        loading.classList.add('active');

        try {
            const base64 = this.docProprietarioPhoto.split(',')[1];
            const mimeType = this.docProprietarioPhoto.split(';')[0].split(':')[1];
            this.showMessage('Enviando foto para IA...', 'success');

            const prompt = `Analise esta foto de documento de identificação (RG, CNH ou similar) e extraia as informações.
Retorne APENAS um JSON válido sem markdown, sem \`\`\`, neste formato exato:
{"nome":"NOME COMPLETO","rg":"NUMERO DO RG","cpf":"NUMERO DO CPF SE VISIVEL"}
Se não conseguir ler algum campo, coloque string vazia.`;

            const result = await this.callGemini(prompt, [{ base64, mimeType }]);
            this.showMessage('Resposta da IA: ' + result, 'success');
            const data = this.normalizeDocumentData(this.parseJSON(result));

            this.proprietarioData = data;
            this.renderProprietarioFields(data);
            if (!data.nome || !data.rg || !data.cpf) {
                this.showMessage('A IA preencheu parcialmente o documento. Complete os campos restantes manualmente se quiser.', 'success');
            } else {
                this.showMessage('Dados extraídos com sucesso!', 'success');
            }
        } catch (error) {
            this.showErrorModal('Erro ao processar documento com IA', error);
            this.showMessage('Erro: ' + error.message, 'error');
            btn.style.display = 'none';
        } finally {
            this.isAnalyzingDoc = false;
            loading.classList.remove('active');
        }
    }

    renderProprietarioFields(data) {
        const container = document.getElementById('proprietarioFields');
        container.innerHTML = `
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Nome Completo</label>
                    <input type="text" id="propNome" class="input-field" value="${data.nome || ''}" placeholder="Nome">
                </div>
                <div class="form-field">
                    <label class="field-label">RG</label>
                    <input type="text" id="propRG" class="input-field" value="${data.rg || ''}" placeholder="RG">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">CPF</label>
                    <input type="text" id="propCPF" class="input-field" value="${data.cpf || ''}" placeholder="CPF">
                </div>
            </div>`;
        container.querySelectorAll('.input-field').forEach(el => {
            el.addEventListener('input', () => this.autoSave());
        });
        this.autoSave();
    }

    showManualProprietario() {
        const container = document.getElementById('proprietarioFields');
        const btn = document.getElementById('manualProprietario');
        if (container.innerHTML.trim()) {
            container.innerHTML = '';
            btn.textContent = '✏️ Preencher Manualmente';
            btn.classList.remove('active');
            return;
        }
        this.renderProprietarioFields({ nome: '', rg: '', cpf: '' });
        btn.textContent = '✖ Fechar Campos Manuais';
        btn.classList.add('active');
    }

    // ═══════════════════════════════════════
    // VEÍCULO - FOTOS + IA
    // ═══════════════════════════════════════
    async handleVehiclePhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        const side = e.target.dataset.side;
        try {
            const optimizedPhoto = await this.prepareImageForUpload(file, {
                maxWidth: 1280,
                maxHeight: 960,
                quality: 0.62,
                minQuality: 0.4,
                targetMaxBytes: 260000,
                maxAttempts: 6,
                scaleStep: 0.86
            });
            this.sidePhotos[side] = optimizedPhoto;
            this.displayPhotoPreview(side);
            this.autoSave();
            this.maybeAutoAnalyzeVehicle();
        } catch (error) {
            this.showErrorModal('Erro ao preparar foto do veículo', error);
        }
        e.target.value = '';
    }

    async handlePanelPhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        const panel = e.target.dataset.panel;
        try {
            const optimizedPhoto = await this.prepareImageForUpload(file, {
                maxWidth: 1100,
                maxHeight: 825,
                quality: 0.58,
                minQuality: 0.38,
                targetMaxBytes: 220000,
                maxAttempts: 6,
                scaleStep: 0.84
            });
            this.panelPhotos[panel] = optimizedPhoto;
            this.displayPanelPreview(panel);
            this.autoSave();
        } catch (error) {
            this.showErrorModal('Erro ao preparar foto do painel', error);
        }
        e.target.value = '';
    }

    displayPhotoPreview(side) {
        const previewId = `photoPreview${this.capitalizeKey(side)}`;
        const preview = document.getElementById(previewId);
        if (!preview) return;
        if (this.sidePhotos[side]) {
            preview.innerHTML = `<img src="${this.sidePhotos[side]}" alt="Foto ${side}">`;
        } else {
            preview.innerHTML = '';
        }
    }

    displayPanelPreview(panel) {
        const previewId = {
            lights: 'photoPreviewPanelLights',
            full: 'photoPreviewPanelFull',
            trunk: 'photoPreviewTrunk'
        }[panel];
        const preview = document.getElementById(previewId);
        if (!preview) return;
        if (this.panelPhotos[panel]) {
            preview.innerHTML = `<img src="${this.panelPhotos[panel]}" alt="Painel ${panel}">`;
        } else {
            preview.innerHTML = '';
        }
    }

    async handleExtraPhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const optimizedPhoto = await this.prepareImageForUpload(file, {
                maxWidth: 1280,
                maxHeight: 960,
                quality: 0.62,
                minQuality: 0.4,
                targetMaxBytes: 260000,
                maxAttempts: 6,
                scaleStep: 0.86
            });
            this.extraPhotos.push(optimizedPhoto);
            this.renderExtraPhotos();
            this.autoSave();
        } catch (error) {
            this.showErrorModal('Erro ao preparar foto extra', error);
        }
        e.target.value = '';
    }

    renderExtraPhotos() {
        const container = document.getElementById('extraPhotosContainer');
        container.innerHTML = '';
        this.extraPhotos.forEach((photo, index) => {
            const item = document.createElement('div');
            item.className = 'extra-photo-item';
            item.innerHTML = `
                <img src="${photo}" alt="Foto extra ${index + 1}">
                <button type="button" class="extra-photo-remove" data-index="${index}">✕</button>
            `;
            item.querySelector('.extra-photo-remove').addEventListener('click', () => this.removeExtraPhoto(index));
            container.appendChild(item);
        });
    }

    removeExtraPhoto(index) {
        this.extraPhotos.splice(index, 1);
        this.renderExtraPhotos();
        this.autoSave();
    }

    async analyzeVehicle() {
        if (this.isAnalyzingVehicle) return;
        const missing = [];
        const labels = { left: 'Lateral Esquerda', right: 'Lateral Direita', front: 'Frente', back: 'Traseira' };
        Object.entries(this.sidePhotos).forEach(([side, val]) => {
            if (!val) missing.push(labels[side]);
        });
        if (missing.length > 0) {
            this.showModal(`Faltam ${missing.length} foto(s):\n\n• ${missing.join('\n• ')}`);
            return;
        }
        const photos = Object.entries(this.sidePhotos).filter(([, v]) => v);

        const loading = document.getElementById('loadingVeiculo');
        const btn = document.getElementById('btnAnalisarVeiculo');
        this.isAnalyzingVehicle = true;
        btn.style.display = 'none';
        loading.classList.add('active');

        try {
            const images = photos.map(([side, dataUrl]) => ({
                label: labels[side],
                base64: dataUrl.split(',')[1],
                mimeType: dataUrl.split(';')[0].split(':')[1]
            }));
            const vehicleAnalysisRules = `Priorize PRECISAO acima de cobertura. Se houver duvida real sobre marca, modelo, placa ou ano, retorne string vazia nesse campo.
Considere somente sinais visuais do carro, como formato dos farois, lanternas, grade, para-choques, vidros, carroceria, rodas, retrovisores e emblemas legiveis.
Nao chute versao, equipamento ou ano exato.

Regras de saida:
- "marca": somente se estiver visualmente clara
- "modelo": somente se estiver visualmente claro
- "ano_aproximado": somente se der para estimar com boa seguranca; senao, ""
- "placa": somente se estiver realmente legivel
- "cor": use a cor predominante visivel

No checklist:
- inclua somente itens uteis para vistoria
- inclua somente itens compativeis com esse carro
- prefira uma lista enxuta e correta`;

            const prompt = `Analise estas fotos de um veículo. Identifique o veículo e extraia informações.
Retorne APENAS um JSON válido sem markdown, sem \`\`\`, neste formato exato:
${vehicleAnalysisRules}

{
  "placa":"PLACA DO VEICULO",
  "marca":"MARCA",
  "modelo":"MODELO",
  "cor":"COR",
  "ano_aproximado":"ANO APROXIMADO",
  "checklist":[
    "Faróis","Lanternas Traseiras","Retrovisor Esquerdo","Retrovisor Direito",
    "Para-choque Dianteiro","Para-choque Traseiro","Rodas","Pneus",
    "Vidro Dianteiro","Vidro Traseiro","Antena","Escapamento"
  ]
}

IMPORTANTE sobre o checklist:
- Inclua APENAS itens que este modelo específico de veículo possui.
- Sempre inclua itens básicos: Faróis, Lanternas, Retrovisores, Para-choques, Rodas, Pneus, Vidros, Motor Funciona, Cinto de Segurança, Buzina, Extintor, Macaco, Triângulo, Chave de Roda, Estepe.
- Inclua itens específicos se o veículo tiver: Antena no Teto, Engate, Calhas de Chuva, Teto Solar, Rack de Teto, Sensor de Estacionamento, Câmera de Ré, Ar Condicionado, Airbag, etc.
- NÃO inclua itens que o veículo claramente não possui (ex: DVD/Monitor para carros populares).
Se não conseguir identificar algum campo, coloque string vazia.`;

            const result = await this.callGemini(prompt, images);
            const data = this.normalizeVehicleData(this.parseJSON(result));

            this.vehicleData = data;
            this.renderVehicleFields(data);
            if (data.checklist && data.checklist.length > 0) {
                this.renderChecklist(data.checklist);
            } else if (!this.checklistItems.length) {
                this.renderChecklist([
                    'Faróis', 'Lanternas Traseiras', 'Retrovisor Esquerdo', 'Retrovisor Direito',
                    'Para-choque Dianteiro', 'Para-choque Traseiro', 'Rodas', 'Pneus',
                    'Vidro Dianteiro', 'Vidro Traseiro', 'Cinto de Segurança', 'Buzina'
                ]);
            }

            if (!data.placa || !data.marca || !data.modelo || !data.cor) {
                this.showMessage('A IA preencheu parcialmente o veículo. Complete os campos restantes manualmente se quiser.', 'success');
            } else {
                this.showMessage('Dados do veículo preenchidos com sucesso!', 'success');
            }
        } catch (error) {
            this.showErrorModal('Erro ao analisar veículo com IA', error);
            this.showMessage('Erro ao analisar veículo: ' + error.message, 'error');
            btn.style.display = 'none';
        } finally {
            this.isAnalyzingVehicle = false;
            loading.classList.remove('active');
        }
    }

    renderVehicleFields(data) {
        const container = document.getElementById('vehicleFields');
        container.innerHTML = `
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Placa</label>
                    <input type="text" id="veiPlaca" class="input-field" value="${data.placa || ''}" placeholder="ABC-1234" maxlength="8">
                </div>
                <div class="form-field">
                    <label class="field-label">Cor</label>
                    <input type="text" id="veiCor" class="input-field" value="${data.cor || ''}" placeholder="Cor">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Marca</label>
                    <input type="text" id="veiMarca" class="input-field" value="${data.marca || ''}" placeholder="Marca">
                </div>
                <div class="form-field">
                    <label class="field-label">Modelo</label>
                    <input type="text" id="veiModelo" class="input-field" value="${data.modelo || ''}" placeholder="Modelo">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Ano Aproximado</label>
                    <input type="text" id="veiAno" class="input-field" value="${data.ano_aproximado || ''}" placeholder="Ano">
                </div>
                <div class="form-field">
                    <label class="field-label">Combustível</label>
                    <select id="veiFuel" class="input-field">
                        <option value="">Selecione</option>
                        <option value="vazio">Vazio</option>
                        <option value="1/4">1/4</option>
                        <option value="1/2">1/2</option>
                        <option value="3/4">3/4</option>
                        <option value="cheio">Cheio</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">KM</label>
                    <input type="number" id="veiKM" class="input-field" placeholder="Quilometragem">
                </div>
                <div class="form-field">
                    <label class="field-label">Conservação</label>
                    <select id="veiConservacao" class="input-field">
                        <option value="">Selecione</option>
                        <option value="bom">Bom</option>
                        <option value="regular">Regular</option>
                        <option value="riscado">Riscado</option>
                    </select>
                </div>
            </div>`;
        container.querySelectorAll('.input-field').forEach(el => {
            el.addEventListener('input', () => this.autoSave());
            el.addEventListener('change', () => this.autoSave());
        });
        this.autoSave();
    }

    renderChecklist(items) {
        this.checklistItems = items;
        this.checklistStatus = {};
        const container = document.getElementById('checklistContainer');
        let html = '<h3>Checklist de Componentes</h3><div class="checklist-grid">';
        items.forEach((item, i) => {
            const key = `item_${i}`;
            html += `<div class="checklist-item">
                <label>${item}</label>
                <div class="status-buttons">
                    <button type="button" class="status-btn" data-item="${key}" data-status="ok">OK</button>
                    <button type="button" class="status-btn" data-item="${key}" data-status="avaria">Avaria</button>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStatusClick(e));
        });
    }

    handleStatusClick(e) {
        const btn = e.target;
        const item = btn.dataset.item;
        const status = btn.dataset.status;
        document.querySelectorAll(`[data-item="${item}"]`).forEach(b => {
            b.classList.remove('ok', 'avaria');
        });
        btn.classList.add(status);
        this.checklistStatus[item] = status;
        this.autoSave();
    }

    showManualVehicle() {
        const vContainer = document.getElementById('vehicleFields');
        const cContainer = document.getElementById('checklistContainer');
        const btn = document.getElementById('manualVeiculo');
        if (vContainer.innerHTML.trim()) {
            vContainer.innerHTML = '';
            cContainer.innerHTML = '';
            this.checklistItems = [];
            this.checklistStatus = {};
            btn.textContent = '✏️ Preencher Manualmente';
            btn.classList.remove('active');
            return;
        }
        this.renderVehicleFields({ placa: '', marca: '', modelo: '', cor: '', ano_aproximado: '' });
        const defaultChecklist = [
            'Faróis', 'Lanternas Traseiras', 'Retrovisor Esquerdo', 'Retrovisor Direito',
            'Para-choque Dianteiro', 'Para-choque Traseiro', 'Rodas', 'Pneus',
            'Vidro Dianteiro', 'Vidro Traseiro', 'Antena', 'Engate',
            'Ar Condicionado', 'Airbag', 'Cinto de Segurança', 'Buzina',
            'Extintor', 'Macaco', 'Triângulo', 'Chave de Roda', 'Estepe',
            'Motor Funciona', 'Câmbio', 'Chave de Ignição',
            'Forrações/Estofados', 'Tapete', 'Rádio'
        ];
        this.renderChecklist(defaultChecklist);
        btn.textContent = '✖ Fechar Campos Manuais';
        btn.classList.add('active');
    }

    // ═══════════════════════════════════════
    // GEMINI API
    // ═══════════════════════════════════════
    async callGemini(prompt, images) {
        const apiUrl = '/api/gemini';
        const parts = [{ text: prompt }];

        images.forEach(img => {
            if (img.label) {
                parts.push({ text: `Foto: ${img.label}` });
            }
            parts.push({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.base64
                }
            });
        });

        let response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                })
            });
        } catch (networkErr) {
            const msg = `Erro de rede ao chamar a IA.\n\nDetalhes: ${networkErr.message}`;
            this.showErrorModal('Erro de rede na IA', {
                message: msg,
                stack: networkErr?.stack,
                diagnostic: this.buildDiagnosticSnapshot({
                    endpoint: apiUrl,
                    online: navigator.onLine,
                    userAgent: navigator.userAgent,
                    imagensEnviadas: images.length,
                    horario: new Date().toLocaleString('pt-BR')
                })
            });
            throw new Error(msg);
        }

        if (!response.ok) {
            let errBody = '';
            try { errBody = await response.text(); } catch (_) {}
            let userFacingReason = errBody || 'Sem detalhes';
            try {
                const parsed = JSON.parse(errBody);
                if (parsed?.userMessage) {
                    userFacingReason = `${parsed.userMessage}\n\nDetalhes tecnicos:\n${errBody}`;
                } else if (response.status === 503) {
                    userFacingReason = `A IA esta com alta demanda no momento. O sistema tentou novamente automaticamente, mas o servico continuou indisponivel.\n\nDetalhes tecnicos:\n${errBody}`;
                } else if (response.status === 429) {
                    userFacingReason = `A chave da IA esta temporariamente sem capacidade ou cota disponivel. Aguarde um pouco e tente novamente.\n\nDetalhes tecnicos:\n${errBody}`;
                }
            } catch (_) {
                if (response.status === 503) {
                    userFacingReason = 'A IA esta com alta demanda no momento. O sistema tentou novamente automaticamente, mas o servico continuou indisponivel.';
                }
            }
            const msg = `Erro na API (HTTP ${response.status}):\n\n${userFacingReason}`;
            this.showErrorModal('Erro HTTP na IA', {
                message: msg,
                diagnostic: this.buildDiagnosticSnapshot({
                    endpoint: apiUrl,
                    statusHttp: response.status,
                    statusTexto: response.statusText,
                    contentType: response.headers.get('content-type') || 'não informado',
                    online: navigator.onLine,
                    imagensEnviadas: images.length,
                    horario: new Date().toLocaleString('pt-BR'),
                    corpoResposta: errBody || 'Sem detalhes'
                })
            });
            throw new Error(msg);
        }

        let json;
        try {
            json = await response.json();
        } catch (parseErr) {
            const msg = `Erro ao ler resposta da IA.\n\nDetalhes: ${parseErr.message}`;
            this.showErrorModal('Erro ao interpretar resposta da IA', {
                message: msg,
                stack: parseErr?.stack,
                diagnostic: this.buildDiagnosticSnapshot({
                    endpoint: apiUrl,
                    statusHttp: response.status,
                    contentType: response.headers.get('content-type') || 'não informado',
                    online: navigator.onLine,
                    imagensEnviadas: images.length,
                    horario: new Date().toLocaleString('pt-BR')
                })
            });
            throw new Error(msg);
        }

        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            const msg = `Resposta vazia da IA.\n\nResposta completa:\n${JSON.stringify(json, null, 2)}`;
            this.showErrorModal('Resposta vazia da IA', {
                message: msg,
                diagnostic: this.buildDiagnosticSnapshot({
                    endpoint: apiUrl,
                    statusHttp: response.status,
                    online: navigator.onLine,
                    imagensEnviadas: images.length,
                    horario: new Date().toLocaleString('pt-BR'),
                    respostaJson: JSON.stringify(json, null, 2)
                })
            });
            throw new Error('Resposta vazia da IA');
        }
        return text;
    }

    maybeAutoAnalyzeVehicle() {
        const requiredSides = ['left', 'right', 'front', 'back'];
        const allRequiredReady = requiredSides.every(side => this.sidePhotos[side]);
        if (!allRequiredReady || this.isAnalyzingVehicle) return;

        const signature = requiredSides
            .map(side => `${this.sidePhotos[side]?.length || 0}:${this.sidePhotos[side]?.slice(-24) || ''}`)
            .join('|');
        if (this.lastVehicleAnalysisSignature === signature) return;

        const qualityChecks = requiredSides.map(side =>
            this.assessImageQuality(this.sidePhotos[side], { mode: 'vehicle', label: side })
        );
        const failed = qualityChecks.find(check => !check.ok);
        if (failed) {
            this.showModal(`Nao consegui validar a foto de ${failed.label}.\n\nMotivo: ${failed.reason}\n\nTire novamente com mais luz, menos tremido e pegando bem todo o angulo.`);
            return;
        }

        this.lastVehicleAnalysisSignature = signature;
        this.showMessage('Fotos principais recebidas. Iniciando analise automatica...', 'success');
        this.analyzeVehicle();
    }

    async prepareImageForUpload(file, options = {}) {
        const {
            maxWidth = 1600,
            maxHeight = 1600,
            quality = 0.76,
            outputType = 'image/jpeg',
            targetMaxBytes = 320000,
            minQuality = 0.42,
            maxAttempts = 5,
            scaleStep = 0.88,
            mode = 'default'
        } = options;

        const dataUrl = await this.readFileAsDataURL(file);
        return this.resizeDataUrlImage(dataUrl, {
            maxWidth,
            maxHeight,
            quality,
            outputType,
            targetMaxBytes,
            minQuality,
            maxAttempts,
            scaleStep,
            mode
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'));
            reader.readAsDataURL(file);
        });
    }

    resizeDataUrlImage(dataUrl, options = {}) {
        const {
            maxWidth = 1600,
            maxHeight = 1600,
            quality = 0.76,
            outputType = 'image/jpeg',
            targetMaxBytes = 320000,
            minQuality = 0.42,
            maxAttempts = 5,
            scaleStep = 0.88,
            mode = 'default'
        } = options;

        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const initialScale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
                let width = Math.max(1, Math.round(image.width * initialScale));
                let height = Math.max(1, Math.round(image.height * initialScale));
                let currentQuality = quality;

                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Nao foi possivel inicializar a compressao da imagem.'));
                        return;
                    }

                    ctx.drawImage(image, 0, 0, width, height);
                    this.enhanceCanvasImage(ctx, canvas, mode);
                    const compressed = canvas.toDataURL(outputType, currentQuality);

                    if (compressed.length <= targetMaxBytes || attempt === maxAttempts - 1) {
                        resolve(compressed);
                        return;
                    }

                    currentQuality = Math.max(minQuality, currentQuality - 0.08);
                    width = Math.max(1, Math.round(width * scaleStep));
                    height = Math.max(1, Math.round(height * scaleStep));
                }
            };
            image.onerror = () => reject(new Error('Nao foi possivel processar a imagem selecionada.'));
            image.src = dataUrl;
        });
    }

    enhanceCanvasImage(ctx, canvas, mode) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        if (mode === 'document') {
            for (let i = 0; i < data.length; i += 4) {
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                const boosted = this.clampColor(((gray - 128) * 1.35) + 128 + 10);
                data[i] = boosted;
                data[i + 1] = boosted;
                data[i + 2] = boosted;
            }
            this.applySharpenKernel(data, canvas.width, canvas.height, 0.45);
        } else {
            for (let i = 0; i < data.length; i += 4) {
                data[i] = this.clampColor(((data[i] - 128) * 1.08) + 128 + 4);
                data[i + 1] = this.clampColor(((data[i + 1] - 128) * 1.08) + 128 + 4);
                data[i + 2] = this.clampColor(((data[i + 2] - 128) * 1.08) + 128 + 4);
            }
            this.applySharpenKernel(data, canvas.width, canvas.height, 0.22);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    applySharpenKernel(data, width, height, strength = 0.3) {
        const source = new Uint8ClampedArray(data);
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                for (let channel = 0; channel < 3; channel++) {
                    let value = 0;
                    let kernelIndex = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const sampleIndex = ((y + ky) * width + (x + kx)) * 4 + channel;
                            value += source[sampleIndex] * kernel[kernelIndex++];
                        }
                    }
                    const mixed = source[index + channel] * (1 - strength) + value * strength;
                    data[index + channel] = this.clampColor(mixed);
                }
            }
        }
    }

    clampColor(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    assessImageQuality(dataUrl, options = {}) {
        if (!dataUrl) {
            return { ok: false, reason: 'foto ausente', label: options.label || 'a imagem' };
        }

        const mode = options.mode || 'default';
        const labelMap = {
            left: 'lateral esquerda',
            right: 'lateral direita',
            front: 'frente',
            back: 'traseira',
            document: 'documento'
        };
        const label = labelMap[options.label] || options.label || (mode === 'document' ? 'documento' : 'a imagem');

        try {
            const [meta, payload] = dataUrl.split(',');
            const base64Length = payload ? payload.length : 0;
            if (base64Length < 50000) {
                return { ok: false, reason: 'a foto ficou pequena demais e perdeu detalhe', label };
            }

            const mime = meta || '';
            if (!mime.includes('image/')) {
                return { ok: false, reason: 'arquivo de imagem invalido', label };
            }

            if (mode === 'document' && base64Length < 120000) {
                return { ok: false, reason: 'o documento parece distante ou sem nitidez suficiente', label };
            }

            return { ok: true, reason: '', label };
        } catch (_) {
            return { ok: false, reason: 'nao foi possivel validar a qualidade da foto', label };
        }
    }

    parseJSON(text) {
        // Remove markdown code fences se houver
        let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        try {
            return JSON.parse(clean);
        } catch (error) {
            const repaired = this.tryRepairStructuredResponse(clean);
            if (repaired) return repaired;
            throw new Error(`A IA respondeu em um formato inválido.\nTrecho recebido: ${clean.slice(0, 1200)}`);
        }
    }

    tryRepairStructuredResponse(text) {
        const extractedObject = this.extractBalancedJsonObject(text);
        if (extractedObject) {
            try {
                return JSON.parse(extractedObject);
            } catch (_) {
                // cai para o parser tolerante abaixo
            }
        }

        const salvaged = this.salvageJsonLikeFields(text);
        if (!salvaged) return null;

        const hasUsefulVehicleData = ['placa', 'marca', 'modelo', 'cor', 'ano_aproximado']
            .some(key => typeof salvaged[key] === 'string' && salvaged[key]);
        const hasUsefulDocumentData = ['nome', 'rg', 'cpf']
            .some(key => typeof salvaged[key] === 'string' && salvaged[key]);
        const hasChecklist = Array.isArray(salvaged.checklist) && salvaged.checklist.length > 0;

        return (hasUsefulVehicleData || hasUsefulDocumentData || hasChecklist) ? salvaged : null;
    }

    extractBalancedJsonObject(text) {
        const start = text.indexOf('{');
        if (start === -1) return '';

        let depth = 0;
        let inString = false;
        let escaping = false;

        for (let i = start; i < text.length; i++) {
            const char = text[i];

            if (inString) {
                if (escaping) {
                    escaping = false;
                } else if (char === '\\') {
                    escaping = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{') depth++;
            if (char === '}') {
                depth--;
                if (depth === 0) {
                    return text.slice(start, i + 1);
                }
            }
        }

        return '';
    }

    salvageJsonLikeFields(text) {
        const readStringField = (field) => {
            const match = text.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)`, 'i'));
            return match ? match[1].trim() : '';
        };

        const readChecklist = () => {
            const checklistStart = text.search(/"checklist"\s*:\s*\[/i);
            if (checklistStart === -1) return [];

            const slice = text.slice(checklistStart);
            const items = [];
            const itemRegex = /"([^"\n\r]+)"/g;
            let match;

            while ((match = itemRegex.exec(slice)) !== null) {
                const value = match[1].trim();
                if (value.toLowerCase() === 'checklist') continue;
                if (!value) continue;
                items.push(value);
            }

            return [...new Set(items)];
        };

        return {
            placa: readStringField('placa'),
            marca: readStringField('marca'),
            modelo: readStringField('modelo'),
            cor: readStringField('cor'),
            ano_aproximado: readStringField('ano_aproximado'),
            nome: readStringField('nome'),
            rg: readStringField('rg'),
            cpf: readStringField('cpf'),
            checklist: readChecklist()
        };
    }

    normalizeVehicleData(data) {
        const safeText = (value) => {
            if (typeof value !== 'string') return '';
            const trimmed = value.trim();
            if (!trimmed) return '';
            if (/^(desconhecido|nao identificado|não identificado|nao visivel|não visível|incerto|n\/a|null|undefined)$/i.test(trimmed)) {
                return '';
            }
            return trimmed;
        };

        const normalizedChecklist = Array.isArray(data.checklist)
            ? [...new Set(
                data.checklist
                    .map(item => safeText(item))
                    .filter(Boolean)
            )].slice(0, 18)
            : [];

        return {
            placa: safeText(data.placa).toUpperCase(),
            marca: safeText(data.marca),
            modelo: safeText(data.modelo),
            cor: safeText(data.cor),
            ano_aproximado: safeText(data.ano_aproximado),
            checklist: normalizedChecklist
        };
    }

    normalizeDocumentData(data) {
        const safeText = (value) => {
            if (typeof value !== 'string') return '';
            const trimmed = value.trim();
            if (!trimmed) return '';
            if (/^(desconhecido|nao identificado|n\/a|null|undefined)$/i.test(trimmed)) {
                return '';
            }
            return trimmed;
        };

        return {
            nome: safeText(data.nome),
            rg: safeText(data.rg).toUpperCase(),
            cpf: safeText(data.cpf)
        };
    }

    setupGlobalErrorHandlers() {
        window.addEventListener('error', (event) => {
            const details = event.error || new Error(event.message || 'Erro JavaScript desconhecido');
            this.showErrorModal('Erro inesperado na tela', {
                message: details.message,
                stack: details.stack,
                diagnostic: this.buildDiagnosticSnapshot({
                    arquivo: event.filename || 'não informado',
                    linha: event.lineno || 'não informado',
                    coluna: event.colno || 'não informado',
                    online: navigator.onLine,
                    horario: new Date().toLocaleString('pt-BR')
                })
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason instanceof Error
                ? event.reason
                : new Error(typeof event.reason === 'string' ? event.reason : JSON.stringify(event.reason, null, 2));
            this.showErrorModal('Falha assíncrona não tratada', {
                message: reason.message,
                stack: reason.stack,
                diagnostic: this.buildDiagnosticSnapshot({
                    online: navigator.onLine,
                    horario: new Date().toLocaleString('pt-BR'),
                    origem: 'unhandledrejection'
                })
            });
        });
    }

    buildDiagnosticSnapshot(details) {
        return Object.entries(details)
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([label, value]) => `${label}: ${value}`)
            .join('\n');
    }

    // ═══════════════════════════════════════
    // SIGNATURE CANVASES
    // ═══════════════════════════════════════
    setupSignatureCanvases() {
        ['sigOperador', 'sigProprietario'].forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            let isDrawing = false;

            const setupCanvas = () => {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            };

            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
                    y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
                };
            };

            canvas.addEventListener('mousedown', (e) => {
                isDrawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            });
            canvas.addEventListener('mouseup', () => { isDrawing = false; this.autoSave(); });
            canvas.addEventListener('mousemove', (e) => {
                if (!isDrawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            });
            canvas.addEventListener('touchstart', (e) => {
                isDrawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            });
            canvas.addEventListener('touchend', () => { isDrawing = false; this.autoSave(); });
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!isDrawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            });

            setupCanvas();

            const clearBtnId = `clear${canvasId.charAt(0).toUpperCase() + canvasId.slice(1)}`;
            document.getElementById(clearBtnId).addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setupCanvas();
                this.autoSave();
            });
        });
    }

    // ═══════════════════════════════════════
    // FORM DATA
    // ═══════════════════════════════════════
    getFormData() {
        const safeVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.toUpperCase() : '';
        };

        return {
            companyName: safeVal('companyName'),
            operador: safeVal('operador'),
            propNome: safeVal('propNome'),
            propRG: safeVal('propRG'),
            propCPF: safeVal('propCPF'),
            veiPlaca: safeVal('veiPlaca'),
            veiMarca: safeVal('veiMarca'),
            veiModelo: safeVal('veiModelo'),
            veiCor: safeVal('veiCor'),
            veiAno: safeVal('veiAno'),
            veiFuel: safeVal('veiFuel'),
            veiKM: document.getElementById('veiKM')?.value || '',
            veiConservacao: safeVal('veiConservacao'),
            observations: safeVal('observations'),
            checklistItems: this.checklistItems,
            checklistStatus: this.checklistStatus,
            sidePhotos: this.sidePhotos,
            panelPhotos: this.panelPhotos,
            extraPhotos: this.extraPhotos,
            docProprietarioPhoto: this.docProprietarioPhoto,
            signatures: {
                operador: document.getElementById('sigOperador').toDataURL(),
                proprietario: document.getElementById('sigProprietario').toDataURL()
            },
            timestamp: new Date().toISOString()
        };
    }

    // ═══════════════════════════════════════
    // SAVE / LOAD / CLEAR
    // ═══════════════════════════════════════
    saveDraft() {
        try {
            const data = this.getFormData();
            localStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
            this.showMessage('Salvo com sucesso!', 'success');
        } catch (error) {
            this.showMessage('Erro ao salvar: ' + error.message, 'error');
        }
    }

    autoSave() {
        try {
            const data = this.getFormData();
            sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
        } catch (e) { /* silent */ }
    }

    loadDraft() {
        try {
            const data = JSON.parse(localStorage.getItem(this.DRAFT_KEY));
            if (!data) return;

            if (data.companyName) document.getElementById('companyName').value = data.companyName;
            if (data.operador) document.getElementById('operador').value = data.operador;
            if (data.observations) document.getElementById('observations').value = data.observations;

            // Proprietário
            if (data.propNome || data.propRG || data.propCPF) {
                this.renderProprietarioFields({ nome: data.propNome || '', rg: data.propRG || '', cpf: data.propCPF || '' });
            }
            if (data.docProprietarioPhoto) {
                this.docProprietarioPhoto = data.docProprietarioPhoto;
                document.getElementById('previewDocProprietario').innerHTML = `<img src="${data.docProprietarioPhoto}" alt="Documento">`;
                document.getElementById('btnAnalisarProprietario').style.display = 'none';
            }

            // Veículo
            if (data.veiPlaca || data.veiMarca || data.veiModelo) {
                this.renderVehicleFields({
                    placa: data.veiPlaca || '', marca: data.veiMarca || '', modelo: data.veiModelo || '',
                    cor: data.veiCor || '', ano_aproximado: data.veiAno || ''
                });
                // Restaurar selects
                if (data.veiFuel) { const el = document.getElementById('veiFuel'); if (el) el.value = data.veiFuel; }
                if (data.veiKM) { const el = document.getElementById('veiKM'); if (el) el.value = data.veiKM; }
                if (data.veiConservacao) { const el = document.getElementById('veiConservacao'); if (el) el.value = data.veiConservacao; }
            }

            // Checklist
            if (data.checklistItems && data.checklistItems.length > 0) {
                this.renderChecklist(data.checklistItems);
                if (data.checklistStatus) {
                    this.checklistStatus = data.checklistStatus;
                    Object.entries(data.checklistStatus).forEach(([item, status]) => {
                        const btn = document.querySelector(`[data-item="${item}"][data-status="${status}"]`);
                        if (btn) btn.classList.add(status);
                    });
                }
            }

            // Fotos veículo
            if (data.sidePhotos) {
                this.sidePhotos = data.sidePhotos;
                Object.keys(this.sidePhotos).forEach(side => this.displayPhotoPreview(side));
                document.getElementById('btnAnalisarVeiculo').style.display = 'none';
            }
            if (data.panelPhotos) {
                this.panelPhotos = data.panelPhotos;
                Object.keys(this.panelPhotos).forEach(panel => this.displayPanelPreview(panel));
            }

            // Fotos extras
            if (data.extraPhotos && data.extraPhotos.length > 0) {
                this.extraPhotos = data.extraPhotos;
                this.renderExtraPhotos();
            }
        } catch (error) {
            console.error('Erro ao carregar draft:', error);
        }
    }

    clearForm() {
        if (!confirm('Deseja limpar todos os dados e começar um novo laudo?')) return;

        document.getElementById('operador').value = '';
        document.getElementById('observations').value = '';

        // Limpar proprietário
        this.docProprietarioPhoto = null;
        document.getElementById('previewDocProprietario').innerHTML = '';
        document.getElementById('proprietarioFields').innerHTML = '';
        document.getElementById('btnAnalisarProprietario').style.display = 'none';

        // Limpar veículo
        this.sidePhotos = { left: null, right: null, front: null, back: null };
        ['left', 'right', 'front', 'back'].forEach(side => this.displayPhotoPreview(side));
        this.panelPhotos = { lights: null, full: null, trunk: null };
        ['lights', 'full', 'trunk'].forEach(panel => this.displayPanelPreview(panel));
        this.extraPhotos = [];
        this.renderExtraPhotos();
        document.getElementById('vehicleFields').innerHTML = '';
        document.getElementById('checklistContainer').innerHTML = '';
        document.getElementById('btnAnalisarVeiculo').style.display = 'none';

        // Limpar assinaturas
        ['sigOperador', 'sigProprietario'].forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            canvas.width = canvas.width;
        });

        this.checklistStatus = {};
        this.checklistItems = [];
        this.proprietarioData = {};
        this.vehicleData = {};
        this.lastVehicleAnalysisSignature = '';
        localStorage.removeItem(this.DRAFT_KEY);
        this.showMessage('Novo laudo pronto para preenchimento', 'success');
    }

    // ═══════════════════════════════════════
    // GERAR PDF
    // ═══════════════════════════════════════
    async generatePDF() {
        try {
            if (!window.jspdf && !window.jsPDF) await this.loadJsPDF();

            const data = this.getFormData();
            let jsPDFConstructor;
            if (window.jspdf && window.jspdf.jsPDF) jsPDFConstructor = window.jspdf.jsPDF;
            else if (window.jsPDF && window.jsPDF.jsPDF) jsPDFConstructor = window.jsPDF.jsPDF;
            else if (window.jsPDF) jsPDFConstructor = window.jsPDF;
            else throw new Error('jsPDF não carregado');

            const doc = new jsPDFConstructor({ orientation: 'p', unit: 'mm', format: 'a4' });
            let y = 0;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - margin * 2;
            const col2X = margin + contentWidth / 2 + 3;
            const halfWidth = contentWidth / 2 - 3;
            const timestamp = new Date(data.timestamp).toLocaleString('pt-BR');

            const azulEscuro = [30, 58, 138];
            const cinzaClaro = [243, 244, 246];
            const cinzaBorda = [209, 213, 219];
            const verdeOk = [22, 163, 74];
            const vermelhoAvaria = [220, 38, 38];
            const branco = [255, 255, 255];
            const preto = [50, 50, 50];

            const checkPage = (needed) => {
                if (y + needed > pageHeight - 20) { doc.addPage(); y = 15; }
            };

            const drawSectionTitle = (title) => {
                checkPage(30);
                doc.setFillColor(...azulEscuro);
                doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
                doc.setTextColor(...branco);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(title, margin + 4, y + 6.5);
                y += 13;
            };

            const drawFieldRow = (label, value, x, width) => {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...azulEscuro);
                doc.text(label, x, y);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...preto);
                doc.text(value || '—', x, y + 5);
                doc.setDrawColor(...cinzaBorda);
                doc.setLineWidth(0.3);
                doc.line(x, y + 7, x + width, y + 7);
            };

            const drawFooter = () => {
                const total = doc.internal.getNumberOfPages();
                for (let i = 1; i <= total; i++) {
                    doc.setPage(i);
                    doc.setDrawColor(...cinzaBorda);
                    doc.setLineWidth(0.5);
                    doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);
                    doc.setFontSize(7);
                    doc.setTextColor(150, 150, 150);
                    doc.setFont('helvetica', 'italic');
                    doc.text(`Documento gerado em: ${timestamp}`, margin, pageHeight - 8);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Página ${i} de ${total}`, margin + contentWidth - 20, pageHeight - 8);

                    const whatsLink = 'https://wa.me/5532991075164';
                    const whatsText = 'Tenha seu checklist inteligente';
                    doc.setFontSize(6);
                    doc.setTextColor(180, 180, 180);
                    doc.setFont('helvetica', 'italic');
                    const wtWidth = doc.getTextWidth(whatsText);
                    const wtX = margin + (contentWidth - wtWidth) / 2;
                    const wtY = pageHeight - 4;
                    doc.textWithLink(whatsText, wtX, wtY, { url: whatsLink });
                }
            };

            // HEADER
            doc.setFillColor(46, 51, 147);
            doc.rect(0, 0, pageWidth, 42, 'F');
            doc.setFillColor(220, 38, 38);
            doc.rect(0, 42, pageWidth, 3, 'F');

            // Logo no PDF
            const logoImg = document.querySelector('.header-logo');
            if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
                try {
                    const logoCanvas = document.createElement('canvas');
                    logoCanvas.width = logoImg.naturalWidth;
                    logoCanvas.height = logoImg.naturalHeight;
                    const logoCtx = logoCanvas.getContext('2d');
                    logoCtx.drawImage(logoImg, 0, 0);
                    const logoData = logoCanvas.toDataURL('image/jpeg', 0.9);
                    const logoRatio = logoImg.naturalWidth / logoImg.naturalHeight;
                    const logoH = 22;
                    const logoW = logoH * logoRatio;
                    doc.addImage(logoData, 'JPEG', margin, 5, logoW, logoH);
                } catch (e) { console.error('Erro ao inserir logo no PDF:', e); }
            }

            doc.setTextColor(...branco);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(data.companyName || 'IGUAÇU REBOQUE', margin, 34);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text(timestamp, margin + contentWidth - doc.getTextWidth(timestamp), 38);
            y = 52;

            // OPERADOR
            drawSectionTitle('OPERADOR DO REBOQUE');
            drawFieldRow('OPERADOR', data.operador, margin, contentWidth);
            y += 14;

            // PROPRIETÁRIO
            drawSectionTitle('DADOS DO PROPRIETÁRIO');
            drawFieldRow('NOME COMPLETO', data.propNome, margin, contentWidth);
            y += 12;
            drawFieldRow('RG', data.propRG, margin, halfWidth);
            drawFieldRow('CPF', data.propCPF, col2X, halfWidth);
            y += 14;

            // VEÍCULO
            drawSectionTitle('DADOS DO VEÍCULO');
            drawFieldRow('PLACA', data.veiPlaca, margin, halfWidth);
            drawFieldRow('COR', data.veiCor, col2X, halfWidth);
            y += 12;
            drawFieldRow('MARCA', data.veiMarca, margin, halfWidth);
            drawFieldRow('MODELO', data.veiModelo, col2X, halfWidth);
            y += 12;
            drawFieldRow('ANO', data.veiAno, margin, halfWidth);
            drawFieldRow('COMBUSTÍVEL', data.veiFuel, col2X, halfWidth);
            y += 12;
            drawFieldRow('QUILOMETRAGEM', data.veiKM ? `${data.veiKM} KM` : '—', margin, halfWidth);
            drawFieldRow('CONSERVAÇÃO', data.veiConservacao, col2X, halfWidth);
            y += 14;

            // CHECKLIST
            if (data.checklistItems && data.checklistItems.length > 0) {
                drawSectionTitle('CHECKLIST DE COMPONENTES');
                doc.setFillColor(...azulEscuro);
                doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F');
                doc.setTextColor(...branco);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('COMPONENTE', margin + 4, y + 5.5);
                doc.text('STATUS', margin + contentWidth - 30, y + 5.5);
                y += 10;

                data.checklistItems.forEach((item, index) => {
                    checkPage(10);
                    const key = `item_${index}`;
                    const status = data.checklistStatus[key] || '';

                    if (index % 2 === 0) {
                        doc.setFillColor(...cinzaClaro);
                        doc.rect(margin, y - 4, contentWidth, 8, 'F');
                    }

                    doc.setTextColor(...preto);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.text(item.toUpperCase(), margin + 4, y);

                    if (status === 'ok') {
                        doc.setFillColor(...verdeOk);
                        doc.roundedRect(margin + contentWidth - 35, y - 4, 22, 7, 2, 2, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.text('OK', margin + contentWidth - 28, y);
                    } else if (status === 'avaria') {
                        doc.setFillColor(...vermelhoAvaria);
                        doc.roundedRect(margin + contentWidth - 35, y - 4, 22, 7, 2, 2, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.text('AVARIA', margin + contentWidth - 33, y);
                    } else {
                        doc.setTextColor(150, 150, 150);
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'italic');
                        doc.text('N/A', margin + contentWidth - 28, y);
                    }
                    y += 8;
                });
                y += 5;
            }

            // OBSERVAÇÕES
            if (data.observations) {
                drawSectionTitle('OBSERVAÇÕES');
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...preto);
                const obsLines = doc.splitTextToSize(data.observations, contentWidth - 10);
                const obsHeight = obsLines.length * 5 + 8;
                checkPage(obsHeight + 5);
                doc.setFillColor(255, 253, 235);
                doc.setDrawColor(234, 179, 8);
                doc.setLineWidth(0.5);
                doc.roundedRect(margin, y - 2, contentWidth, obsHeight, 2, 2, 'FD');
                doc.text(obsLines, margin + 5, y + 4);
                y += obsHeight + 5;
            }

            // FOTOS
            const sideLabels = { left: 'LATERAL ESQUERDA', right: 'LATERAL DIREITA', front: 'FRENTE', back: 'TRASEIRA' };
            const photoSides = Object.keys(data.sidePhotos).filter(s => data.sidePhotos[s]);
            if (photoSides.length > 0) {
                drawSectionTitle('REGISTRO FOTOGRÁFICO');
                const photoWidth = (contentWidth - 6) / 2;
                const photoHeight = 55;
                let photosInRow = 0;
                let photoX = margin;

                photoSides.forEach(side => {
                    checkPage(photoHeight + 15);
                    try {
                        doc.setDrawColor(...cinzaBorda);
                        doc.setLineWidth(0.5);
                        doc.roundedRect(photoX, y, photoWidth, photoHeight + 8, 2, 2, 'S');
                        doc.setFillColor(...azulEscuro);
                        doc.roundedRect(photoX + 2, y + 1, photoWidth - 4, 6, 1, 1, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text(sideLabels[side], photoX + 4, y + 5);
                        doc.addImage(data.sidePhotos[side], 'JPEG', photoX + 2, y + 9, photoWidth - 4, photoHeight - 2);
                        photoX += photoWidth + 6;
                        photosInRow++;
                        if (photosInRow >= 2) {
                            y += photoHeight + 12;
                            photoX = margin;
                            photosInRow = 0;
                        }
                    } catch (e) { console.error('Erro foto:', e); }
                });
                if (photosInRow > 0) y += photoHeight + 12;
                y += 3;
            }

            const panelLabels = { lights: 'LUZES E KILOMETRAGEM', full: 'PAINEL TOTAL', trunk: 'PORTA-MALAS' };
            const panelSides = Object.keys(data.panelPhotos || {}).filter(panel => data.panelPhotos[panel]);
            if (panelSides.length > 0) {
                drawSectionTitle('PAINEL DO VEÍCULO');
                const panelWidth = (contentWidth - 6) / 2;
                const panelHeight = 55;
                let panelsInRow = 0;
                let panelX = margin;

                panelSides.forEach(panel => {
                    checkPage(panelHeight + 15);
                    try {
                        doc.setDrawColor(...cinzaBorda);
                        doc.setLineWidth(0.5);
                        doc.roundedRect(panelX, y, panelWidth, panelHeight + 8, 2, 2, 'S');
                        doc.setFillColor(...azulEscuro);
                        doc.roundedRect(panelX + 2, y + 1, panelWidth - 4, 6, 1, 1, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text(panelLabels[panel], panelX + 4, y + 5);
                        doc.addImage(data.panelPhotos[panel], 'JPEG', panelX + 2, y + 9, panelWidth - 4, panelHeight - 2);
                        panelX += panelWidth + 6;
                        panelsInRow++;
                        if (panelsInRow >= 2) {
                            y += panelHeight + 12;
                            panelX = margin;
                            panelsInRow = 0;
                        }
                    } catch (e) { console.error('Erro painel:', e); }
                });
                if (panelsInRow > 0) y += panelHeight + 12;
                y += 3;
            }

            // FOTOS EXTRAS
            const extras = data.extraPhotos || [];
            if (extras.length > 0) {
                drawSectionTitle('FOTOS ADICIONAIS');
                const extraWidth = (contentWidth - 6) / 2;
                const extraHeight = 55;
                let extrasInRow = 0;
                let extraX = margin;

                extras.forEach((photo, i) => {
                    checkPage(extraHeight + 15);
                    try {
                        doc.setDrawColor(...cinzaBorda);
                        doc.setLineWidth(0.5);
                        doc.roundedRect(extraX, y, extraWidth, extraHeight + 8, 2, 2, 'S');
                        doc.setFillColor(...azulEscuro);
                        doc.roundedRect(extraX + 2, y + 1, extraWidth - 4, 6, 1, 1, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`FOTO ${i + 1}`, extraX + 4, y + 5);
                        doc.addImage(photo, 'JPEG', extraX + 2, y + 9, extraWidth - 4, extraHeight - 2);
                        extraX += extraWidth + 6;
                        extrasInRow++;
                        if (extrasInRow >= 2) {
                            y += extraHeight + 12;
                            extraX = margin;
                            extrasInRow = 0;
                        }
                    } catch (e) { console.error('Erro foto extra:', e); }
                });
                if (extrasInRow > 0) y += extraHeight + 12;
                y += 3;
            }

            // TERMO
            drawSectionTitle('TERMO DE AUTORIZAÇÃO');
            const termoTexto = 'Autorizo a empresa a efetuar os reparos necessários no veículo acima descrito, isentando-a de qualquer responsabilidade por objetos pessoais deixados no interior do veículo. Declaro estar ciente das condições do veículo conforme descrito neste laudo de inspeção.';
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...preto);
            const termoLines = doc.splitTextToSize(termoTexto, contentWidth - 10);
            const termoHeight = termoLines.length * 4.5 + 8;
            checkPage(termoHeight + 5);
            doc.setFillColor(239, 246, 255);
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y - 2, contentWidth, termoHeight, 2, 2, 'FD');
            doc.text(termoLines, margin + 5, y + 4);
            y += termoHeight + 5;

            // ASSINATURAS
            checkPage(65);
            drawSectionTitle('ASSINATURAS');
            const sigWidth = halfWidth - 5;
            const sigHeight = 25;

            doc.setDrawColor(...cinzaBorda);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y, sigWidth + 10, sigHeight + 18, 2, 2, 'S');
            try {
                if (data.signatures.operador?.indexOf('base64') > -1) {
                    doc.addImage(data.signatures.operador, 'PNG', margin + 5, y + 2, sigWidth, sigHeight);
                }
            } catch (e) {}
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.8);
            doc.line(margin + 5, y + sigHeight + 4, margin + sigWidth + 5, y + sigHeight + 4);
            doc.setTextColor(...azulEscuro);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('OPERADOR DO REBOQUE', margin + 5, y + sigHeight + 10);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(120, 120, 120);
            doc.text('Assinatura', margin + 5, y + sigHeight + 14);

            doc.setDrawColor(...cinzaBorda);
            doc.roundedRect(col2X, y, sigWidth + 10, sigHeight + 18, 2, 2, 'S');
            try {
                if (data.signatures.proprietario?.indexOf('base64') > -1) {
                    doc.addImage(data.signatures.proprietario, 'PNG', col2X + 5, y + 2, sigWidth, sigHeight);
                }
            } catch (e) {}
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.8);
            doc.line(col2X + 5, y + sigHeight + 4, col2X + sigWidth + 5, y + sigHeight + 4);
            doc.setTextColor(...azulEscuro);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('PROPRIETÁRIO DO VEÍCULO', col2X + 5, y + sigHeight + 10);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(120, 120, 120);
            doc.text('Assinatura', col2X + 5, y + sigHeight + 14);

            drawFooter();

            const filename = `Laudo_${data.propNome || 'SemNome'}_${data.veiMarca || ''}_${Date.now()}.pdf`;
            doc.save(filename);
            this.showMessage('PDF gerado com sucesso!', 'success');
        } catch (error) {
            this.showErrorModal('Erro ao gerar PDF', error);
            this.showMessage('Erro ao gerar PDF: ' + error.message, 'error');
            console.error('PDF error:', error);
        }
    }

    loadJsPDF() {
        return new Promise((resolve, reject) => {
            if (window.jspdf || window.jsPDF) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => setTimeout(resolve, 200);
            script.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
            document.head.appendChild(script);
        });
    }

    showModal(text) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-box">
            <p>${text.replace(/\n/g, '<br>')}</p>
            <button class="modal-close">Entendi</button>
        </div>`;
        overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    showErrorModal(title, error) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const detailLines = [];
        const message = error?.message || String(error || 'Erro desconhecido');
        detailLines.push(message);

        if (error?.diagnostic) {
            detailLines.push('');
            detailLines.push('Diagnóstico:');
            detailLines.push(error.diagnostic);
        }

        if (error?.stack) {
            detailLines.push('');
            detailLines.push('Stack:');
            detailLines.push(error.stack);
        }

        overlay.innerHTML = `<div class="modal-box modal-box-error">
            <h3>${this.escapeHtml(title || 'Erro')}</h3>
            <p>Ocorreu uma falha e os detalhes estão abaixo para diagnóstico no celular.</p>
            <pre class="modal-error-details">${this.escapeHtml(detailLines.join('\n'))}</pre>
            <button class="modal-close">Fechar</button>
        </div>`;

        overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    showMessage(text, type) {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        const container = document.querySelector('.form-container');
        container.insertBefore(msg, container.firstChild);
        setTimeout(() => msg.remove(), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => { new LaudoApp(); });
