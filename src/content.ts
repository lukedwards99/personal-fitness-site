export type Post = {
  slug: string; title: string; excerpt: string; kind: 'advice' | 'journey';
  category: string; date: string; readTime: number; image: string;
  body: { heading: string; text: string }[];
  workout?: { exercise: string; sets: string; reps: string }[];
  workoutTitle?: string;
};

// Original demonstration content. Replace these entries with Luke's published writing.
export const posts: Post[] = [
  {
    slug: 'build-a-week-you-can-repeat', title: 'Build a week you can actually repeat.',
    excerpt: 'A practical four-day training split that leaves room for the rest of your life.',
    kind: 'advice', category: 'Workouts', date: '2026-10-15', readTime: 6, image: '/images/free-weights.webp',
    body: [
      { heading: 'Start with the week you have', text: 'A useful program fits your actual calendar. Before choosing exercises, choose the sessions you can reliably make. This sample four-day split alternates upper and lower body sessions, leaving space between demanding days. You can move the days around without treating a missed Monday as a failed week.' },
      { heading: 'Keep the useful work simple', text: 'Give each session a main movement, a supporting movement, and a few smaller exercises. Keep enough of the same exercises from week to week to notice improvement. The sample upper-body session below is a starting point to adapt to your experience, equipment and recovery.' },
      { heading: 'Leave yourself somewhere to go', text: 'Choose a load you can control throughout the full set. Record the repetitions you completed and how the set felt. When the top of your planned range becomes consistently manageable, make a small increase. Progress is easier to see when you change one thing at a time.' },
    ],
    workout: [
      { exercise: 'Dumbbell bench press', sets: '3', reps: '8–12' },
      { exercise: 'Chest-supported row', sets: '3', reps: '8–12' },
      { exercise: 'Lat pulldown', sets: '3', reps: '10–12' },
      { exercise: 'Dumbbell lateral raise', sets: '2', reps: '12–15' },
      { exercise: 'Cable triceps pressdown', sets: '2', reps: '10–15' },
    ],
    workoutTitle: 'Sample upper-body session',
  },
  {
    slug: 'make-your-training-log-useful', title: 'Your training log should tell you something.',
    excerpt: 'What to write down, what to ignore, and how to spot the progress hiding in plain sight.',
    kind: 'advice', category: 'Training tips', date: '2026-10-12', readTime: 4, image: '/images/training-detail.webp',
    body: [
      { heading: 'Record the essentials', text: 'Write the exercise, load, completed repetitions and number of working sets. Add a short note when something meaningfully changes: a different machine, a shorter rest, or an unfamiliar movement. A log is most useful when it is easy enough to maintain.' },
      { heading: 'Compare like with like', text: 'A heavier set is not automatically a better set. Notice the range of motion, control and effort as well as the number on the dumbbell. Look for patterns over several sessions rather than judging the program from one unusually good or difficult day.' },
      { heading: 'Use the information', text: 'Before the next session, glance at the last one. Give yourself one specific aim: another controlled repetition, a more consistent setup, or a better-paced session. Your notes should help you make that small decision.' },
    ],
  },
  {
    slug: 'recovery-is-part-of-the-plan', title: 'Make room for the work between workouts.',
    excerpt: 'A quieter approach to recovery, consistency, and knowing when to take a step back.',
    kind: 'advice', category: 'Recovery', date: '2026-10-08', readTime: 5, image: '/images/gym-floor.webp',
    body: [
      { heading: 'Notice your baseline', text: 'It helps to know what a normal training week feels like before making a big change. Note your energy, sleep routine, motivation and the quality of your sessions. These observations are context for your training, rather than another score to chase.' },
      { heading: 'Plan for ordinary life', text: 'Make the easier version of the week before you need it. A shorter session or an extra rest day can help keep the habit alive during a demanding week. Consistency can include adjusting the plan.' },
      { heading: 'Review, then adjust', text: 'If several sessions feel unusually difficult, look at the whole week rather than adding more work by default. Consider reducing a little volume and reviewing how you feel. Persistent pain or concerns about health deserve individual professional guidance.' },
    ],
  },
  {
    slug: 'the-lower-day-step-by-step', title: 'The lower day, one exercise at a time.',
    excerpt: 'The other half of the four-day split: a lower-body session built around one main lift.',
    kind: 'advice', category: 'Workouts', date: '2026-10-05', readTime: 5, image: '/images/training-detail.webp',
    body: [
      { heading: 'Pick one main lift', text: 'Open the session with the movement that needs the most attention. In this sample it is a hip hinge, trained for moderate repetitions so you can keep your position from the first rep to the last. Warm up with a few lighter sets before you reach your working weight.' },
      { heading: 'Support it, then stop', text: 'After the main lift, add one compound exercise for the legs, a single-leg movement and two smaller exercises. Each one has a job. The sample lower-body session below is a starting point to adapt to your experience, equipment and recovery.' },
      { heading: 'Watch how you recover', text: 'Lower-body sessions can leave you more tired than the session itself suggests. Notice how you feel walking into the next workout. If the following session regularly suffers, reduce a set or two here before reducing anything else.' },
    ],
    workout: [
      { exercise: 'Romanian deadlift', sets: '3', reps: '6–10' },
      { exercise: 'Leg press', sets: '3', reps: '10–12' },
      { exercise: 'Dumbbell split squat', sets: '2', reps: '8–10 each' },
      { exercise: 'Lying leg curl', sets: '2', reps: '10–15' },
      { exercise: 'Standing calf raise', sets: '3', reps: '10–15' },
    ],
    workoutTitle: 'Sample lower-body session',
  },
  {
    slug: 'warm-up-for-the-work-ahead', title: 'Warm up for the work ahead.',
    excerpt: 'A short, specific warm-up that gets you ready for your first working set without using up the session.',
    kind: 'advice', category: 'Training tips', date: '2026-09-30', readTime: 4, image: '/images/training-session.webp',
    body: [
      { heading: 'Match the warm-up to the session', text: 'A useful warm-up prepares you for the first exercise you are about to do. A few minutes of easy movement can help you feel ready. After that, the most specific preparation is usually the exercise itself, done lighter.' },
      { heading: 'Build up in a few steps', text: 'Start with an easy load for a comfortable number of repetitions. Increase the weight over two or three sets while doing fewer repetitions each time. Use these sets to check your setup and range of motion before the work counts.' },
      { heading: 'Keep the energy for later', text: 'The goal is to arrive at your first working set prepared rather than tired. If your warm-up has grown into a workout of its own, trim it back. Later exercises in the session usually need less preparation.' },
    ],
  },
  {
    slug: 'starting-with-a-baseline', title: 'Starting with a baseline, not a finish line.',
    excerpt: 'The first page: making room for honest check-ins, small wins, and the weeks in between.',
    kind: 'journey', category: 'The beginning', date: '2026-10-16', readTime: 5, image: '/images/athlete-editorial.webp',
    body: [
      { heading: 'A place for the whole process', text: 'This is a sample opening entry showing how a personal bodybuilding journal could read. It is a place to document the ordinary work: training decisions, changing priorities and lessons that only become clear after a few weeks. The real story will be written by Luke.' },
      { heading: 'What a check-in can include', text: 'Each entry can bring together reflections on the training week, optional progress photographs and notes about what comes next. The aim is to make the journey readable without reducing every week to numbers. Honest context makes both the good days and the frustrating ones useful.' },
      { heading: 'The next page', text: 'Future entries can follow a training block, capture a change in approach or return to a question from an earlier post. No competition timeline, physique measurements or personal achievements are implied by this demonstration. Replace this sample with your first real entry when you are ready.' },
    ],
  },
  {
    slug: 'the-week-that-didnt-go-to-plan', title: 'The week that didn’t go to plan.',
    excerpt: 'A sample reflection on showing up, adjusting expectations, and keeping the long view.',
    kind: 'journey', category: 'Weekly check-in', date: '2026-10-09', readTime: 4, image: '/images/gym-floor.webp',
    body: [
      { heading: 'The plan meets the calendar', text: 'This illustrative journal entry explores an ordinary training challenge: a busy week changes the schedule. A useful personal blog can describe what changed, the decision that followed and what the experience taught, without pretending that every week is a breakthrough.' },
      { heading: 'Keep the useful lesson', text: 'A journal creates room to reflect on the difference between a flexible plan and a lost habit. This section could include the sessions you kept, the exercises you adjusted and the thoughts you want to revisit next week. These are prompts for your writing, not a record of Luke’s actual training.' },
    ],
  },
  {
    slug: 'learning-to-trust-the-ordinary-days', title: 'Learning to trust the ordinary days.',
    excerpt: 'Why the uneventful weeks may be the ones worth writing about.',
    kind: 'journey', category: 'Reflections', date: '2026-10-02', readTime: 3, image: '/images/training-detail.webp',
    body: [
      { heading: 'Nothing dramatic to report', text: 'This sample entry demonstrates a shorter reflective post. A training journal does not need a dramatic reveal each week. There is room for the repetition, the routines and the small observations that give a longer journey its shape.' },
      { heading: 'An archive with perspective', text: 'Over time, even a few paragraphs per entry create a useful record. Looking back can reveal changes in how you train and what you value. This is illustrative writing; your own experience belongs here.' },
    ],
  },
  {
    slug: 'why-write-any-of-this-down', title: 'Why write any of this down?',
    excerpt: 'A sample entry on keeping a public journal, and what it can hold besides results.',
    kind: 'journey', category: 'Reflections', date: '2026-09-25', readTime: 3, image: '/images/training-session.webp',
    body: [
      { heading: 'A record, not a highlight reel', text: 'This sample entry shows how a journal might explain its own purpose. Writing regularly can turn scattered training thoughts into something you can return to. It does not need to be polished, and it does not need to report a win every week.' },
      { heading: 'Something to look back on', text: 'A few honest paragraphs now can become useful context later. This is illustrative writing rather than an account of Luke’s training. Replace it with the reason you decided to start writing.' },
    ],
  },
  {
    slug: 'what-goes-into-a-check-in', title: 'What goes into a weekly check-in.',
    excerpt: 'A sample structure for short, regular updates: the week, the decisions, and the next step.',
    kind: 'journey', category: 'Weekly check-in', date: '2026-09-18', readTime: 4, image: '/images/free-weights.webp',
    body: [
      { heading: 'Three useful questions', text: 'This sample entry demonstrates a repeatable check-in format. What happened in training this week? What decision did it lead to? What is the focus for next week? Three short answers can be enough.' },
      { heading: 'Room for the rest of life', text: 'A check-in can also mention the context around training, such as a busy stretch at work or a change in routine, when that context helps explain a decision. No real measurements, timelines or results are implied by this demonstration.' },
    ],
  },
];

export const advice = posts.filter(post => post.kind === 'advice');
export const journey = posts.filter(post => post.kind === 'journey');
export const formatDate = (date: string, short = false) => new Intl.DateTimeFormat('en-US', { month: short ? 'short' : 'long', day: 'numeric', year: short ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
