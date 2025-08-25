/**
 * @file game.js
 * @description Contains the logic for the Tic-Tac-Toe game.
 */

export class TicTacToeGame {
    constructor() {
        this.reset();
    }

    /**
     * Resets the game to its initial state.
     */
    reset() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.isGameActive = true;
        this.winner = null;
        this.isDraw = false;
    }

    /**
     * Makes a move on the board at the given index.
     * @param {number} index - The cell index (0-8).
     * @returns {boolean} - True if the move was successful, false otherwise.
     */
    makeMove(index) {
        if (!this.isGameActive || this.board[index] !== null) {
            return false; // Invalid move
        }

        this.board[index] = this.currentPlayer;
        this.checkForEndOfGame();

        if (this.isGameActive) {
            this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        }

        return true; // Move was successful
    }

    /**
     * Checks if the game has ended (win or draw).
     */
    checkForEndOfGame() {
        const winningCombinations = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        for (const combination of winningCombinations) {
            const [a, b, c] = combination;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                this.isGameActive = false;
                this.winner = this.board[a];
                return;
            }
        }

        if (!this.board.includes(null)) {
            this.isGameActive = false;
            this.isDraw = true;
        }
    }

    /**
     * Returns the current state of the game.
     * @returns {object} The game state.
     */
    getState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            isGameActive: this.isGameActive,
            winner: this.winner,
            isDraw: this.isDraw
        };
    }
}
