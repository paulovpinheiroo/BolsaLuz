var credluz =
    (function () {
        var CHAVE_PROPOSTAS = 'credluz_propostas';
        var CHAVE_TEMA = 'credluz-tema';

        function mascaraCPF(campo) {
            var v = campo.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            campo.value = v;
        }

        function mascaraTelefone(campo) {
            var v = campo.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 10) {
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
                v = v.replace(/(\d{5})(\d{4})$/, '$1-$2');
            } else if (v.length > 6) {
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
                v = v.replace(/(\d{4})(\d{4})$/, '$1-$2');
            } else if (v.length > 2) {
                v = v.replace(/(\d{2})(\d)/, '($1) $2');
            }
            campo.value = v;
        }

        function aplicarMascaras() {
            var cpf = document.getElementById('cpf');
            var telefone = document.getElementById('telefone');
            if (cpf) {
                cpf.addEventListener('input', function () { mascaraCPF(cpf); });
            }
            if (telefone) {
                telefone.addEventListener('input', function () { mascaraTelefone(telefone); });
            }
        }

        function iniciarTema() {
            var salvo = localStorage.getItem(CHAVE_TEMA) || 'dark';
            document.documentElement.setAttribute('data-theme', salvo);

            var botao = document.getElementById('btn-tema');
            if (!botao) return;
            var icone = botao.querySelector('i');
            if (icone) icone.className = salvo === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

            botao.addEventListener('click', function () {
                var atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', atual);
                localStorage.setItem(CHAVE_TEMA, atual);
                if (icone) icone.className = atual === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            });
        }

        function pegarPropostas() {
            try {
                var bruto = localStorage.getItem(CHAVE_PROPOSTAS);
                return bruto ? JSON.parse(bruto) : [];
            } catch (e) {
                return [];
            }
        }

        function salvarPropostas(lista) {
            localStorage.setItem(CHAVE_PROPOSTAS, JSON.stringify(lista));
        }

        function gerarId() {
            return 'CL-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 9999);
        }

        function montarProposta(dados) {
            var beneficioSim = dados.beneficio === 'sim';
            var caixaTemSim = dados.caixaTem === 'sim';
            var elegivel = beneficioSim && caixaTemSim;
            var proposta = {
                id: gerarId(),
                programa: 'bolsa_familia',
                etapa: 'novo_lead',
                dados: {
                    cpf: dados.cpf,
                    nome: dados.nome,
                    nascimento: dados.nascimento || '',
                    celular: dados.celular || ''
                },
                beneficio: {
                    chave: beneficioSim ? 'acima400' : 'ate350',
                    faixa: beneficioSim ? 'Acima de R$400' : 'Até R$350',
                    elegivel: elegivel
                },
                respostas: {
                    beneficioPeloMenos400: beneficioSim ? 'sim' : 'nao',
                    recebeNoCaixaTem: caixaTemSim ? 'sim' : 'nao'
                },
                status: 'LEAD',
                enviadoEm: new Date().toISOString()
            };
            return proposta;
        }

        function salvarProposta(dados) {
            var proposta = montarProposta(dados);
            var lista = pegarPropostas();
            lista.push(proposta);
            salvarPropostas(lista);
            return proposta;
        }

        function rotear(proposta) {
            var base = document.body.dataset.baseCredluz || '';
            if (proposta.beneficio.elegivel) {
                window.location.href = base + 'Acompanhar.html';
            } else {
                window.location.href = base + 'NaoElegivel.html';
            }
        }

        function enviarProposta(e) {
            e.preventDefault();

            var cpf = document.getElementById('cpf');
            var nome = document.getElementById('nome');
            var nascimento = document.getElementById('nascimento');
            var telefone = document.getElementById('telefone');
            var beneficioA400 = document.querySelector('input[name="beneficio"]:checked');
            var caixaTem = document.querySelector('input[name="caixa_tem"]:checked');

            if (!cpf || cpf.value.replace(/\D/g, '').length !== 11) {
                alert('Informe um CPF válido para continuar.');
                if (cpf) cpf.focus();
                return;
            }
            if (!nome || nome.value.trim().length < 3) {
                alert('Informe seu nome completo para continuar.');
                if (nome) nome.focus();
                return;
            }
            if (!nascimento || !nascimento.value) {
                alert('Informe sua data de aniversário para continuar.');
                if (nascimento) nascimento.focus();
                return;
            }
            if (!telefone || telefone.value.replace(/\D/g, '').length < 10) {
                alert('Informe um celular/WhatsApp válido para continuar.');
                if (telefone) telefone.focus();
                return;
            }
            if (!beneficioA400 || !caixaTem) {
                alert('Responda todas as perguntas para continuar.');
                return;
            }

            var proposta = salvarProposta({
                cpf: cpf.value,
                nome: nome.value.trim(),
                nascimento: nascimento.value,
                celular: telefone.value,
                beneficio: beneficioA400.value,
                caixaTem: caixaTem.value
            });

            rotear(proposta);
        }

        function configurarFormulario() {
            var form = document.getElementById('form-proposta');
            if (!form) return;
            form.addEventListener('submit', enviarProposta);
        }

        function iniciar() {
            iniciarTema();
            aplicarMascaras();
            configurarFormulario();
        }

        return {
            iniciar: iniciar,
            pegarPropostas: pegarPropostas,
            salvarPropostas: salvarPropostas,
            montarProposta: montarProposta,
            mascaraCPF: mascaraCPF,
            mascaraTelefone: mascaraTelefone
        };
    })();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', credluz.iniciar);
} else {
    credluz.iniciar();
}