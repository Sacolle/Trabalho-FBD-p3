import cliSelect from 'cli-select';
import chalk from 'chalk';
import inquirer from 'inquirer';

import pg from 'pg';
import credentials from './credential.json' assert { type: "json"};

/*{
	"host": "localhost",
	"port": 5432,
	"database": "FBD",
	"user": "postgres",
	"password": "*************"
}*/
const client = new pg.Client(credentials);
client.connect((err) => {
	if(err){
		console.error("error in conection",err.stack)
		process.exit(1)
	}else{
		console.log("connected")
	}
})

const queries = {
	'Todos os Professores' : {
		query: (args) => {
			return `SELECT matricula, nome FROM usuarios where professor;`
		}
	},
	'Todos os Alunos' : {
		query: (args) => {
			return `SELECT matricula, nome FROM usuarios where not professor;`
		}
	},
	'Todos os Cursos' : {
		query: (args) => {
			return `SELECT nome, data_inicio FROM cursos;`
		}
	},
	'Todos os Questionarios' : {
		query: (args) => {
			return `
			SELECT cursos.nome, questionarios.id_material, materiais.titulo, questionarios.data_hora_limite 
			FROM questionarios join materiais on(questionarios.id_material = materiais.id)
			join modulos on(materiais.id_modulo = modulos.id)
			join cursos on(modulos.id_curso = cursos.id);`
		}
	},
	'Todos os Trabalhos': {
		query: (args) => {
			return `
			SELECT questionarios.id_material, materiais.titulo, questionarios.data_hora_limite 
			FROM questionarios join materiais on(questionarios.id_material = materiais.id);`
		}
	},
	'Cursos Sobrecarregados' : {
		extraArgs : [{
				type: 'input',
				name: 'alunos',
				message: 'numero de alunos máximos: '
			},{
				type: 'input',
				name: 'professores',
				message: 'número de professores mínimo: '
			}
		],
		query: (args) => {
			return `
			select cursos.id, cursos.nome
			from cursos join responsaveis ON(cursos.id = responsaveis.id_curso)
			group by cursos.nome, cursos.id
			HAVING count(responsaveis.id_professor) < ${args.professores}
			INTERSECT
			select cursos.id, cursos.nome
			from cursos join matriculados ON(cursos.id = matriculados.id_curso)
			group by cursos.nome, cursos.id
			HAVING COUNT(matriculados.id_aluno) > ${args.alunos};
			`
		} // 5; DROP TABLE usuarios
	},
	'Numero de questões por questionario' : {
		query: (args) => {
			return `
			SELECT materiais.titulo, count(questionarios.id_material) FROM materiais
			JOIN questionarios ON(materiais.id = questionarios.id_material)
			JOIN existe ON(questionarios.id_material = existe.id_questionario)
			GROUP BY materiais.titulo, questionarios.id_material;	
			`
		}
	},
	'Alunos que não tiraram nunhuma nota abaixo de um valor em questionarios sem peso' : {
		extraArgs : [{
				type: 'input',
				name: 'nota',
				message: 'Nota mínima do aluno: '
			}],
		query: (args) => {
			return `
			select distinct usuarios.nome
			from usuarios
			where usuarios.professor = false and usuarios.matricula not in (
				select fizeram_questionarios.id_aluno
				from fizeram_questionarios join questionarios ON(questionarios.id_material = fizeram_questionarios.id_questionario)
				where nota < ${args.nota}
				and questionarios.peso is null
			) ORDER BY usuarios.nome;
			`
		}
	},
	'Fóruns que nenhum professor comentou' : {
		query: (args) => {
			return `
			SELECT distinct foruns.id_material from usuarios
			join comentam ON (usuarios.matricula = comentam.id_usuario)
			join foruns ON (foruns.id_material = comentam.id_forum)
			where foruns.id_material NOT IN (
				SELECT comentam.id_forum from usuarios
				join comentam ON (usuarios.matricula = comentam.id_usuario)
				where usuarios.professor
			);	
			`
		}
	},
	'Alunos matriculados em todas as turmas de um Professor' : {
		extraArgs : [{
				type: 'input',
				name: 'id',
				message: 'Matricula do professor: '
			}],
		query: (args) => {
			return `
			select nome
			from usuarios
			where matricula<>${args.id}
			and professor = false
			and not exists (select id_curso
							from responsaveis
							where id_professor=${args.id}
							and id_curso not in (select id_curso
												from matriculados
												where id_aluno=usuarios.matricula))
							and not exists (select id_curso
											from responsaveis
											where id_professor=${args.id}
											and id_curso not in (select id_curso
																from matriculados
																where id_aluno=usuarios.matricula))
			order by nome;
			`
		}
	},
	'Alunos que tiraram nota maior que um valor em um questionario' : {
		extraArgs : [{
				type: 'input',
				name: 'questionario',
				message: 'Nome do questionario: '
			},{
				type: 'input',
				name: 'curso',
				message: 'Nome do curso: '
			},{
				type: 'input',
				name: 'data',
				message: 'Data de inicio do curso: '
			},{
				type: 'input',
				name: 'nota',
				message: 'Nota de corte: '
			}
		],
		query: (args) => {
			return `
			select usuarios.nome, fizeram_questionarios.nota from materiais_de_curso
			join cursos ON(materiais_de_curso.curso_id = cursos.id)
			join questionarios ON(materiais_de_curso.material_id = questionarios.id_material)
			join fizeram_questionarios ON(questionarios.id_material = fizeram_questionarios.id_questionario)
			join usuarios ON(usuarios.matricula = fizeram_questionarios.id_aluno)
			where
			materiais_de_curso.titulo = '${args.questionario}' and
			cursos.nome = '${args.curso}' and
			cursos.data_inicio = '${args.data}' and
			fizeram_questionarios.nota >= ${args.nota};	
			`
		}
	},
	'Curso em que se encontra um trabalho' : {
		extraArgs : [{
				type: 'input',
				name: 'trabalho',
				message: 'Nome do trabalho: '
			},{
				type: 'input',
				name: 'horario',
				message: 'Data e Hora de entrega do Trabalho: '
			}
		],
		query: (args) => {
			return `
			select cursos.nome
			from trabalhos join materiais_de_curso ON(materiais_de_curso.material_id = trabalhos.id_material)
			join cursos ON( cursos.id = materiais_de_curso.curso_id)
			where materiais_de_curso.titulo = '${args.trabalho}'
			and trabalhos.data_hora_limite = '${args.horario}';	
			`
		}
	},
	'Alunos inscritos em um curso' : {
		extraArgs : [{
				type: 'input',
				name: 'curso',
				message: 'Nome do Curso: '
			},{
				type: 'input',
				name: 'data',
				message: 'Data de inicio do curso: '
			}
		],
		query: (args) => {
			return `
			select usuarios.nome
			from usuarios join matriculados ON(usuarios.matricula = matriculados.id_aluno)
			join cursos ON(cursos.id = matriculados.id_curso)
			where cursos.nome = '${args.curso}'
			and cursos.data_inicio = '${args.data}';	
			`
		}
	},
	'Todas as tentativas de um usuário em um questionario de um semestre' : {
		extraArgs : [{
				type: 'input',
				name: 'matricula',
				message: 'Matricula do aluno: '
			},{
				type: 'input',
				name: 'questionario',
				message: 'Nome do questionario: '
			},{
				type: 'input',
				name: 'curso',
				message: 'Nome do curso: '
			},{
				type: 'input',
				name: 'data',
				message: 'Data de inicio do curso: '
			}
		],
		query: (args) => {
			return `
			SELECT fizeram_questionarios.id
			FROM fizeram_questionarios JOIN materiais_de_curso ON(materiais_de_curso.material_id = fizeram_questionarios.id_questionario)
			JOIN cursos ON(materiais_de_curso.curso_id = cursos.id)
			WHERE fizeram_questionarios.id_aluno = ${args.matricula}
			and materiais_de_curso.titulo = '${args.questionario}'
			and cursos.nome = '${args.curso}'
			and cursos.data_inicio = '${args.data}';
			`
		}
	},
	'Nome dos professores responsáveis por um material' : {
		extraArgs : [{
				type: 'input',
				name: 'id',
				message: 'Id do material: '
			}
		],
		query: (args) => {
			return `
			select usuarios.nome
			from usuarios join responsaveis on(responsaveis.id_professor=usuarios.matricula)
			join materiais_de_curso ON(materiais_de_curso.curso_id = responsaveis.id_curso)
			where materiais_de_curso.material_id=${args.id};
			`
		}
	},
	'[PARA O TRIGGER] Inserir um arquivo em um user' : {
		extraArgs : [{
				type: 'input',
				name: 'id',
				message: 'Id do arquivo: '
			},{
				type: 'input',
				name: 'nome',
				message: 'Nome do arquivo: '
			},{
				type: 'input',
				name: 'matricula',
				message: 'Matricula do usuário: '
			}
		],
		query: (args) => {
			return `
			insert into arquivos (id, nome, local_host, caminho, id_usuario, privado)
			values (${args.id}, '${args.nome}', 'google.com', '/local/', ${args.matricula}, true);
			`
		}
	}
}
const options = {
	values: Object.keys(queries),
	defaultValue: 0,
	selected: '(*)',
    unselected: '( )',
	indentation: 0,
	cleanup: true,
	outputStream: process.stdout,
    inputStream: process.stdin,
	valueRenderer: (value, selected) => {
		if(Object.keys(queries).indexOf(value) < 5){
			const v = `[${chalk.red('HELPER')}] ${value}`
			return selected ? chalk.underline(v) : v
		}
		return selected ? chalk.underline(value) : value
	}
}

async function pgQuery(q){
	try{
		const res = await client.query(q)
		if(res.rows.length > 0){
			console.table(res.rows)
		}else{
			console.log("Nenhum valor retornado.")
		}
	}catch(err){
		console.error(chalk.red(chalk.bold("[Erro]")) + " Query inválido", err.where)
	}
}

async function menu(){
	cliSelect(options, async (response) => {
		if (response.id !== null) {
			const query = queries[response.value]
			if(query.extraArgs === undefined){
				await pgQuery(query.query())
			}else{
				const args = await inquirer.prompt(query.extraArgs)
				const q = query.query(args)
				await pgQuery(q)
			}
			const mais = await inquirer.prompt([{
				type: 'input',
				name: 'confirm',
				message: 'Aperte enter para continuar...',
			}]);
			menu()
		} else {
			console.log('Obridado por usar');
			client.end()
		}
	});
}
menu()
