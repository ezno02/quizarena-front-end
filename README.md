# Quiz Arena — Front-end

Front-end do Quiz Arena construído com Vite, React, TypeScript e Tailwind CSS.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

O projeto abre em `http://localhost:3000`.

## Build de produção

```bash
pnpm build
```

## Integração com Firebase

A integração recomendada usa **Firebase Authentication** para identificar o jogador e **Cloud Firestore** para armazenar as respostas. A checagem pode ser feita por uma Cloud Function para evitar que a resposta correta fique exposta no navegador.

### Estrutura sugerida no Firestore

```text
users/{userId}
questions/{questionId}
answers/{answerId}
```

Documento `answers/{answerId}`:

```json
{
  "userId": "firebase_user_123",
  "questionId": "question_005",
  "answer": "The Legend of Zelda",
  "status": "pending",
  "accepted": null,
  "points": 0,
  "submittedAt": "server_timestamp",
  "checkedAt": null
}
```

### Enviar resposta pelo front-end

Instale o SDK:

```bash
pnpm add firebase
```

Configure o Firebase em `src/lib/firebase.ts` usando variáveis `VITE_FIREBASE_*` e envie a resposta com o usuário autenticado:

```ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, auth } from './firebase'

const user = auth.currentUser
if (!user) throw new Error('Usuário não autenticado')

const answerRef = await addDoc(collection(db, 'answers'), {
  userId: user.uid,
  questionId: 'question_005',
  answer: 'The Legend of Zelda',
  status: 'pending',
  accepted: null,
  points: 0,
  submittedAt: serverTimestamp(),
  checkedAt: null,
})

console.log('answerId:', answerRef.id)
```

Payload lógico enviado ao Firestore:

```json
{
  "userId": "firebase_user_123",
  "questionId": "question_005",
  "answer": "The Legend of Zelda",
  "status": "pending",
  "accepted": null,
  "points": 0
}
```

### Checar a resposta com Cloud Function

A checagem deve acontecer no backend/Cloud Function, e não depender de uma resposta correta enviada pelo cliente. A função pode ler `questions/{questionId}`, normalizar a resposta e atualizar o documento `answers/{answerId}`:

```ts
await updateDoc(doc(db, 'answers', answerId), {
  status: 'checked',
  accepted: true,
  points: 100,
  checkedAt: serverTimestamp(),
  message: 'Resposta correta!',
})
```

Resultado aprovado:

```json
{
  "answerId": "answer_8f3c21",
  "questionId": "question_005",
  "status": "checked",
  "accepted": true,
  "points": 100,
  "checkedAt": "2026-09-29T22:30:01.240Z",
  "message": "Resposta correta!"
}
```

Resultado incorreto:

```json
{
  "answerId": "answer_8f3c21",
  "questionId": "question_005",
  "status": "checked",
  "accepted": false,
  "points": 0,
  "message": "Resposta não reconhecida."
}
```

### Acompanhar a checagem em tempo real

O front-end pode ouvir alterações do documento com `onSnapshot`:

```ts
import { doc, onSnapshot } from 'firebase/firestore'

const unsubscribe = onSnapshot(doc(db, 'answers', answerId), (snapshot) => {
  const result = snapshot.data()
  // Atualizar a UI conforme result.status e result.accepted
})

// Chamar unsubscribe quando o componente for desmontado.
```

### Regras de segurança essenciais

- O cliente só pode criar respostas para o próprio `request.auth.uid`.
- O cliente não deve poder alterar `accepted`, `points`, `status` ou `checkedAt`.
- A Cloud Function usa Admin SDK para fazer a checagem e atualizar o resultado.
- A resposta correta deve ficar protegida em `questions` ou em uma coleção acessível apenas ao backend.
- Valide tamanho, formato e duplicidade da resposta antes de gravar.

Exemplo conceitual de regra para criação:

```text
allow create: if request.auth != null
  && request.resource.data.userId == request.auth.uid
  && request.resource.data.status == 'pending';
```

### Dados que hoje estão mockados no front-end

- Pergunta atual e progresso da rodada
- Histórico de temas
- Ranking de jogadores
- Usuário atual

Esses dados podem ser substituídos por listeners do Firestore mantendo os mesmos formatos visuais usados em `src/App.tsx`.

## Como o código está organizado

- `src/main.tsx` — ponto de entrada do React; monta o componente `App`.
- `src/App.tsx` — tela principal e componentes da página. Está dividido em `LeftSidebar`, `QuestionCard` e `RankingSidebar`.
- `src/types/quiz.ts` — contrato tipado dos dados que entram na tela e do payload de resposta.
- `src/data/mockQuizData.ts` — adaptador temporário com dados de demonstração; pode ser substituído por um provider/listener do Firebase.
- `src/index.css` — estilos globais organizados por seções: base, cabeçalho, histórico, ranking, pergunta, rodapé e responsividade.
- `public/quiz-arena-logo.png` — logo oficial usada no cabeçalho e favicon.
- `public/manus-routes.json` — manifesto da rota principal.

### Nomes importantes em `src/App.tsx`

- `themeHistory` e `rankingPlayers` — mocks que podem ser substituídos por dados do Firestore.
- `answerText` — texto digitado pelo jogador.
- `submissionStatus` — estado do envio: `idle`, `sending` ou `checked`.
- `handleAnswerSubmit` — função que deve chamar `addDoc` na integração Firebase.
- `handleNewQuestion` — limpa o formulário para a próxima pergunta.
- `visiblePlayers` — ranking depois do filtro de busca.

Os comentários `TODO` no código marcam os pontos onde a simulação local deve ser substituída pela integração real.

### Entrada principal para o backend

O componente `App` aceita dados reais pela prop `quizData`, que precisa seguir o tipo `QuizArenaData`:

```tsx
<App
  quizData={dadosVindosDoFirestore}
  onSubmitAnswer={salvarRespostaNoFirestore}
/>
```

`onSubmitAnswer` recebe `{ userId, questionId, answer }` e deve retornar uma Promise com `SubmitAnswerResult`. O formulário já mostra `sending`, bloqueia o textarea durante o envio e exibe o estado final quando a Promise resolve.

Assim, a integração não precisa editar o layout: basta conectar um listener do Firestore ao `quizData` e passar a função de gravação em `onSubmitAnswer`.

### Variáveis de ambiente do Firebase

Crie um arquivo `.env.local` localmente. Não envie esse arquivo para o Git:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
