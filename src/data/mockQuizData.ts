import type { QuizArenaData } from '../types/quiz'

// Adaptador temporário de desenvolvimento.
// Na integração, substitua este arquivo por um listener do Firestore ou
// carregue o mesmo formato em App.tsx a partir de um QuizDataProvider.
export const mockQuizData: QuizArenaData = {
  currentUser: {
    id: 'user-murilo',
    nickname: 'Murilo',
    score: 1180,
    rank: 12,
    initials: 'M',
  },
  weeklyTheme: {
    id: 'theme-tech-games',
    title: 'Tecnologia & Games',
    description: 'Teste seus conhecimentos sobre o universo tech, games e inovação.',
  },
  themeHistory: [
    { id: 'theme-tech-games', title: 'Tecnologia & Games', dateLabel: '22 de Set', tone: 'cyan' },
    { id: 'theme-animes', title: 'Animes & Mangás', dateLabel: '15 de Set', tone: 'coral' },
    { id: 'theme-filmes', title: 'Filmes & Séries', dateLabel: '08 de Set', tone: 'amber' },
    { id: 'theme-historia-brasil', title: 'História do Brasil', dateLabel: '01 de Set', tone: 'green' },
    { id: 'theme-geografia', title: 'Geografia Mundial', dateLabel: '25 de Ago', tone: 'blue' },
  ],
  rankingPlayers: [
    { id: 'user-lucas', nickname: 'LucasBR', score: 2450, initials: 'LB', rank: 1, tone: 'gold' },
    { id: 'user-darkzin', nickname: 'DarkZin', score: 2320, initials: 'DZ', rank: 2, tone: 'silver' },
    { id: 'user-anajoga', nickname: 'AnaJoga', score: 2180, initials: 'AJ', rank: 3, tone: 'bronze' },
    { id: 'user-techboy', nickname: 'TechBoy', score: 2050, initials: 'TB', rank: 4 },
    { id: 'user-gamergirl', nickname: 'GamerGirl', score: 1890, initials: 'GG', rank: 5 },
    { id: 'user-pedro', nickname: 'Pedro_Dev', score: 1760, initials: 'PD', rank: 6 },
    { id: 'user-zsoul', nickname: 'zSoul', score: 1620, initials: 'ZS', rank: 7 },
    { id: 'user-brunox', nickname: 'BrunoX', score: 1500, initials: 'BX', rank: 8 },
    { id: 'user-lipez', nickname: 'Lipez', score: 1420, initials: 'LP', rank: 9 },
    { id: 'user-rafinha', nickname: 'Rafinha', score: 1360, initials: 'RF', rank: 10 },
  ],
  currentQuestion: {
    id: 'question-005',
    category: 'Games',
    prompt: 'Qual foi o primeiro jogo da franquia',
    highlightedText: 'The Legend of Zelda',
    questionNumber: 5,
    totalQuestions: 20,
    progressPercent: 25,
  },
}
