import { world, system, EquipmentSlot } from "@minecraft/server";
// Added EquipmentSlot para melhor manuseio

const fotosInventario = new Map();
let trancado = false;

// Listagem dos espaços (Mão entra como equipável, lembrar à frente)
const EQUIP_SLOTS = [
    EquipmentSlot.Offhand, 
    EquipmentSlot.Head, 
    EquipmentSlot.Chest, 
    EquipmentSlot.Legs, 
    EquipmentSlot.Feet
];

// Mantendo a função de "print" dos status atuais
function tirarFotoDetalhada(jogador) {
    const container = jogador.getComponent("inventory").container; // Inventário
    const equipaveis = jogador.getComponent("equippable"); // Nova aba para monitorar os equipáveis
    let slots = []; // Lista para guardar os itens

    // Capturando o inventário normal > Item dentro do container se existir item, se não, vazio
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item) {
            slots.push({ tipo: "inv", id: i, data: `${item.typeId}:${item.amount}` });
        } else {
            slots.push({ tipo: "inv", id: i, data: "vazio" });
        }
    }

    // Agora aqui captura os equipaveis, com loop for para os slots citados antes
    for (const slotName of EQUIP_SLOTS) {
        const item = equipaveis.getEquipment(slotName);
        if (item) {
            slots.push({ tipo: "equip", id: slotName, data: `${item.typeId}:${item.amount}` });
        } else {
            slots.push({ tipo: "equip", id: slotName, data: "vazio" });
        }
    }
    return slots;
}

// --- Função de sicnronização de espaçes, individual.. ---
function sincronizarSlotEspecifico(fonte, grupo, infoSlot) {
    const { tipo, id } = infoSlot; // Pega se é inventário ou equipamento e qual o espaço > Usado posteriormente
    
    // Pega o item do jogador fonte > Que iniciou o trigger de sincronia e tals
    let itemFonte;
    if (tipo === "inv") {
        itemFonte = fonte.getComponent("inventory").container.getItem(id);
    } else {
        itemFonte = fonte.getComponent("equippable").getEquipment(id);
    }

    // Passa para todos do grupo > Sincronizando inventários das pessoas
    for (const alvo of grupo) {
        if (alvo.id === fonte.id) continue;
        
        // Aplica o item no "alvo" correto
        if (tipo === "inv") {
            const invAlvo = alvo.getComponent("inventory").container;
            invAlvo.setItem(id, itemFonte ? itemFonte.clone() : undefined); // Undefined sendo um "Salvador" em caso de erro
        } else {
            const equipAlvo = alvo.getComponent("equippable");
            equipAlvo.setEquipment(id, itemFonte ? itemFonte.clone() : undefined);
        }
        
        // Atualiza a "foto" na memória para não dar loop infinito...
        const fotoAlvo = fotosInventario.get(alvo.id); // PEga pelo id do User na memoria
        if (fotoAlvo) {
            const slotParaAtualizar = fotoAlvo.find(s => s.tipo === tipo && s.id === id);
            if (slotParaAtualizar) {
                slotParaAtualizar.data = itemFonte ? `${itemFonte.typeId}:${itemFonte.amount}` : "vazio"; // Salvador vazio
            }
        }
    }
}

// --- FUNÇÃO DE SEGURANÇA PARA QUEM ENTRA --- (REMOÇÃO PROGRAMADA > Melhor para evitar erros de rop de itens e duplicação)
function verificarEForcarSincronizacao(jogadorNovo) {
    const todosJogadores = world.getAllPlayers();
    
    // Encontra os outros que já estão no mundo (Sem precisar checar tag)
    const outrosJogadores = todosJogadores.filter(p => p.id !== jogadorNovo.id);

    if (outrosJogadores.length > 0) {
        // Pega o jogador mais antigo online
        const jogadorMaisAntigo = outrosJogadores[0];
        
        const fotoNovo = tirarFotoDetalhada(jogadorNovo);
        const fotoAntigo = tirarFotoDetalhada(jogadorMaisAntigo);

        let temDiferenca = false;
        for (let i = 0; i < fotoNovo.length; i++) {
            if (fotoNovo[i].data !== fotoAntigo[i].data) {
                temDiferenca = true;
                break;
            }
        }

        // Se o inventário/armadura for diferente do mais antigo, o do mais antigo domina a hierarquia e passa os itens dele para os demais.
        if (temDiferenca) {
            trancado = true; // Tranca para evitar alguns erros
            
            const invAlvo = jogadorNovo.getComponent("inventory").container;
            const invFonte = jogadorMaisAntigo.getComponent("inventory").container;
            const equipAlvo = jogadorNovo.getComponent("equippable");
            const equipFonte = jogadorMaisAntigo.getComponent("equippable");

            // Copia o inventário normal
            for (let i = 0; i < invFonte.size; i++) {
                const itemFonte = invFonte.getItem(i);
                invAlvo.setItem(i, itemFonte ? itemFonte.clone() : undefined);
            }
            
            // Copia armaduras e off-hand
            for (const slotName of EQUIP_SLOTS) {
                const itemEquip = equipFonte.getEquipment(slotName);
                equipAlvo.setEquipment(slotName, itemEquip ? itemEquip.clone() : undefined);
            }

            jogadorNovo.sendMessage("§a[Sync Inventories]§r O sistema é automático agora. Seus itens foram substituídos pelos de §b" + jogadorMaisAntigo.name + "§r para manter o grupo igual.\n");
            
            // Cria fotos novas idênticas para os dois imediatamente para não dar conflito posterior
            const fotoAtualizada = tirarFotoDetalhada(jogadorNovo);
            fotosInventario.set(jogadorNovo.id, fotoAtualizada);
            
            system.runTimeout(() => { trancado = false; }, 5);
        }
    } else {
        // Se ele for o "primeirão", só tira a foto dele
        fotosInventario.set(jogadorNovo.id, tirarFotoDetalhada(jogadorNovo));
    }
}

// --- Detecta quando o jogador entra no mundo ---
world.afterEvents.playerSpawn.subscribe((event) => {
    const jogador = event.player;
    if (!event.initialSpawn) return;

    system.runTimeout(() => {
        if (!jogador || !world.getAllPlayers().some(p => p.id === jogador.id)) return; // Se o jogador desconecta retorna nada para parar a função

        jogador.sendMessage(
            "§a[Sync Inventories]§r O addon de sincronização está ativo!\n" +
            "§eNota:§r A sincronização agora acontece de forma 100% automática para todos que entram."
        );

        // Chama a função direto, não precisa mais do "if(jogador.hasTag)"
        verificarEForcarSincronizacao(jogador);
        
    }, 100); 
});

// --- LOOP PRINCIPAL ---
system.runInterval(() => {
    const todosJogadores = world.getAllPlayers();
    
    // Limpeza de memória (Olha todos os jogadores, não apenas um grupo com tag)
    for (const idSalvo of fotosInventario.keys()) {
        const aindaTaNoServidor = todosJogadores.some(p => p.id === idSalvo);
        if (!aindaTaNoServidor) {
            fotosInventario.delete(idSalvo);
        }
    }

    if (trancado || todosJogadores.length === 0) return; // Se trancado, como mencionado anteriormente, para e retorna nada, valida tbm se ter jogador (Desconexão ou crash causava erro)

    for (const jogador of todosJogadores) {
        if (!fotosInventario.has(jogador.id)) {
            verificarEForcarSincronizacao(jogador);
            continue; 
        }

        const fotoAtual = tirarFotoDetalhada(jogador);
        const fotoAntiga = fotosInventario.get(jogador.id);

        if (fotoAntiga) {
            let mudouAlgo = false;

            for (let i = 0; i < fotoAtual.length; i++) {
                if (fotoAtual[i].data !== fotoAntiga[i].data) {
                    mudouAlgo = true;
                    trancado = true;

                    // Agora passa o objeto inteiro (fotoAtual[i]) para saber se é 'inv' ou 'equip'
                    // Repassamos a lista 'todosJogadores' inteira
                    sincronizarSlotEspecifico(jogador, todosJogadores, fotoAtual[i]);
                    
                    system.runTimeout(() => { trancado = false; }, 1);
                }
            }

            if (mudouAlgo) {
                fotosInventario.set(jogador.id, fotoAtual);
                break; 
            }
        }
    }
}, 2); // Loop > 20 ticks = 1 > Segundo. 2 = 0.1s  