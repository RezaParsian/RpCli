import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

export default function askYesNo(query) {
  return new Promise(resolve => {
    const ask = () => {
      rl.question(query, (answer) => {
        const lower = answer.trim().toLowerCase();
        if (lower === 'y' || lower === 'yes') {
          resolve([rl,true]);
        } else if (lower === 'n' || lower === 'no') {
          resolve([rl,false]);
        } else {
          console.log('Please answer with y (yes) or n (no).');
          ask();
        }
      });
    };
    ask();
  });
}