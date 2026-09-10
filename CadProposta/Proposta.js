const temaBtn = document.getElementById('btn-tema');
const temaBtnIcone = document.querySelector('#btn-tema i');
const temaSalvo = localStorage.getItem('credluz-tema') || 'dark';
document.documentElement.setAttribute('data-theme', temaSalvo);
temaBtnIcone.className = temaSalvo === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

temaBtn.addEventListener('click', function () {
    const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', atual);
    localStorage.setItem('credluz-tema', atual);
    temaBtnIcone.className = atual === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
});

function mascaraCPF(campo) {
    let v = campo.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    campo.value = v;
}

document.addEventListener('input', function (e) {
    if (e.target.id === 'cpf') {
        mascaraCPF(e.target);
        estado.dados.cpf = e.target.value;
    }
    if (e.target.id === 'nome') estado.dados.nome = e.target.value;
});

const estado = {
    dados: { cpf: '', nome: '' },
    respostas: { 2: null, 3: null, 4: null, 5: null },
    passo: 1
};

const VALIDACOES = {
    1: function () {
        if (estado.dados.cpf.replace(/\D/g, '').length !== 11) {
            alert('Informe um CPF válido para continuar.');
            document.getElementById('cpf').focus();
            return false;
        }
        if (estado.dados.nome.trim().length < 3) {
            alert('Informe seu nome completo para continuar.');
            document.getElementById('nome').focus();
            return false;
        }
        return true;
    }
};

const INCENTIVOS = {
    1: 'Vamos descobrir seu limite no Bolsa Família!',
    2: 'Você está indo muito bem!',
    3: 'Continue assim, falta pouco!',
    4: 'Quase lá!',
    5: 'Última pergunta! Falta pouco!',
    6: 'Tudo certo! Proposta pronta!'
};

const itensStepper = document.querySelectorAll('.stepper-item');
const etapas = document.querySelectorAll('.etapa');
const btnVoltarTop = document.getElementById('btn-voltar-top');
const indicador = document.getElementById('etapa-indicador');
const barraProgresso = document.getElementById('barra-progresso');
const incentivo = document.getElementById('incentivo');
const btnConcluir = document.getElementById('btn-concluir');
const NOME_ETAPAS = ['', 'Dados', 'Benefício', 'CadÚnico', 'Contrato', 'Conta', 'Pronto'];

function irPara(passo) {
    estado.passo = Math.min(Math.max(passo, 1), 6);

    etapas.forEach(function (e) {
        e.classList.toggle('ativa', parseInt(e.dataset.etapa, 10) === estado.passo);
    });

    itensStepper.forEach(function (item) {
        const n = parseInt(item.dataset.step, 10);
        item.classList.toggle('ativo', n === estado.passo);
        item.classList.toggle('concluido', n < estado.passo);
    });

    btnVoltarTop.classList.toggle('visivel', estado.passo > 1);
    indicador.textContent = 'Etapa ' + estado.passo + ' de 6 · ' + NOME_ETAPAS[estado.passo];
    barraProgresso.style.width = (estado.passo / 6) * 100 + '%';
    incentivo.textContent = INCENTIVOS[estado.passo] || '';

    restaurarRespostas();

    if (estado.passo === 5) atualizarBotaoConcluir();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restaurarRespostas() {
    const etapa = document.querySelector('.etapa[data-etapa="' + estado.passo + '"]');
    if (!etapa) return;
    const botoes = etapa.querySelectorAll('.resposta');
    botoes.forEach(function (b) {
        b.classList.toggle('selecionado', estado.respostas[estado.passo] === b.dataset.resposta);
    });
}

function registrarResposta(resposta, botao) {
    const et = estado.passo;
    if (et < 2 || et > 5) return;

    estado.respostas[et] = resposta;

    const botoes = document.querySelectorAll('.etapa[data-etapa="' + et + '"] .resposta');
    botoes.forEach(function (b) {
        b.classList.toggle('selecionado', b === botao);
    });

    if (et < 5) {
        setTimeout(function () { irPara(et + 1); }, 250);
    } else {
        atualizarBotaoConcluir();
    }
}

function atualizarBotaoConcluir() {
    btnConcluir.disabled = estado.respostas[5] === null;
}

function montarPayload() {
    return {
        programa: 'bolsa_familia',
        etapa: 'cad_proposta',
        dados: {
            cpf: estado.dados.cpf,
            nome: estado.dados.nome
        },
        respostas: {
            recebeBolsaFamilia: estado.respostas[2],
            cadUnicoAtualizado: estado.respostas[3],
            aceitaDesconto: estado.respostas[4],
            beneficioPeloMenos400: estado.respostas[5]
        },
        enviadoEm: new Date().toISOString()
    };
}

function primeiroNome(nomeCompleto) {
    return nomeCompleto.trim().split(/\s+/)[0] || '';
}

function mostrarMissao(icone, nome, ok) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="missao-icone"><i class="fa-solid ' + icone + '"></i></span>' +
        '<span class="missao-nome">' + nome + '</span>' +
        '<span class="missao-status ' + (ok ? 'sim' : 'nao') + '">' +
        (ok ? '<i class="fa-solid fa-check"></i> Concluído' : '<i class="fa-solid fa-xmark"></i> Não') +
        '</span>';
    return li;
}

function montarTelaFinal() {
    const missoes = document.getElementById('missoes');
    missoes.innerHTML = '';

    const respostasOk = [estado.respostas[2], estado.respostas[3], estado.respostas[4], estado.respostas[5]];
    const pontuacao = respostasOk.filter(function (r) { return r === 'sim'; }).length;

    document.getElementById('pronto-nome').textContent = primeiroNome(estado.dados.nome);

    missoes.appendChild(mostrarMissao('fa-id-card', 'Cadastro realizado', true));
    missoes.appendChild(mostrarMissao('fa-hand-holding-dollar', 'Recebe Bolsa Família', estado.respostas[2] === 'sim'));
    missoes.appendChild(mostrarMissao('fa-shield-halved', 'CadÚnico atualizado', estado.respostas[3] === 'sim'));
    missoes.appendChild(mostrarMissao('fa-file-signature', 'Desconto aceito', estado.respostas[4] === 'sim'));
    missoes.appendChild(mostrarMissao('fa-money-bill-wave', 'Benefício ≥ R$400', estado.respostas[5] === 'sim'));

    document.getElementById('recompensa-contador').textContent = pontuacao + ' de 4';
    montarEstrelas(pontuacao);
    soltarConfete(pontuacao);
}

function montarEstrelas(pontuacao) {
    const container = document.getElementById('recompensa-estrelas');
    container.innerHTML = '';

    for (let i = 0; i < 4; i++) {
        const estrela = document.createElement('i');
        estrela.className = i < pontuacao ? 'fa-solid fa-star cheia' : 'fa-regular fa-star vazia';
        estrela.style.animationDelay = (i * 0.15) + 's';
        container.appendChild(estrela);
    }
}

function criarConfete() {
    const container = document.getElementById('confete');
    const cores = ['#ea580c', '#f97316', '#fbbf24', '#16a34a', '#3b82f6', '#a855f7'];

    for (let i = 0; i < 60; i++) {
        const peca = document.createElement('span');
        peca.style.left = Math.random() * 100 + '%';
        peca.style.backgroundColor = cores[Math.floor(Math.random() * cores.length)];
        peca.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
        peca.style.animationDelay = Math.random() * 1.5 + 's';
        peca.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
        peca.style.width = 6 + Math.random() * 8 + 'px';
        peca.style.height = 10 + Math.random() * 8 + 'px';
        container.appendChild(peca);
    }
}

function soltarConfete(pontuacao) {
    const container = document.getElementById('confete');
    const pecas = container.querySelectorAll('span');

    if (pontuacao === 4) {
        pecas.forEach(function (p) { p.style.display = 'block'; });
    } else {
        pecas.forEach(function (p) { p.style.display = 'none'; });
    }
}

btnVoltarTop.addEventListener('click', function () {
    if (estado.passo > 1) irPara(estado.passo - 1);
});

document.addEventListener('click', function (e) {
    const avancar = e.target.closest('.btn-avancar[data-proximo]');
    if (avancar) {
        const prox = parseInt(avancar.dataset.proximo, 10);
        if (!VALIDACOES[estado.passo] || VALIDACOES[estado.passo]()) {
            irPara(prox);
        }
        return;
    }

    const concluir = e.target.closest('#btn-concluir');
    if (concluir) {
        if (!concluir.disabled) {
            montarTelaFinal();
            console.log('Proposta consolidada (payload):', montarPayload());
            irPara(6);
        }
        return;
    }

    const resposta = e.target.closest('.resposta');
    if (resposta) {
        registrarResposta(resposta.dataset.resposta, resposta);
    }
});

const elementosResposta = document.querySelectorAll('.resposta');
elementosResposta.forEach(function (b) {
    b.addEventListener('click', function () {
        registrarResposta(b.dataset.resposta, b);
    });
});

document.getElementById('btn-nova-proposta').addEventListener('click', function () {
    estado.dados.cpf = '';
    estado.dados.nome = '';
    estado.respostas = { 2: null, 3: null, 4: null, 5: null };

    document.getElementById('cpf').value = '';
    document.getElementById('nome').value = '';

    irPara(1);
});

criarConfete();
irPara(1);

irPara(1);