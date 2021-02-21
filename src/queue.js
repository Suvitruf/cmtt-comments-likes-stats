const QueueState = {
    None:         0,
    Loading:      1,
    Retrying:     2,
    WaitingTasks: 3
};

const RETRIES        = 5;
const DELAY_ON_ERROR = 5000;

export class Queue {
    tasks  = [];
    state  = QueueState.None;
    timer  = null;
    period = 100;

    constructor({period}) {
        this.period = period;

        this.start();
    }

    delay = async (delay) => {
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    startTask = async (task) => {
        let tries = 0;
        while (tries < RETRIES) {
            try {
                const response = await task.run();

                if (response.status >= 400 && response.status < 600) {
                    throw new Error('Bad response from server: ' + response.status);
                }

                switch (this.state) {
                    case QueueState.Retrying:
                        this.state = QueueState.Loading;
                        break;
                }

                return response.json();
            } catch (e) {
                this.state = QueueState.Retrying;

                await this.delay(DELAY_ON_ERROR);
                tries++;
            }
        }

        this.state = QueueState.Loading;

        throw new Error('delay on error: to much retires');
    }

    checkTasks = () => {
        if (!this.tasks.length) {
            this.state = QueueState.WaitingTasks;

            return;
        }

        switch (this.state) {
            case QueueState.Retrying:
                return;
            case QueueState.WaitingTasks:
                this.state = QueueState.Loading;
                break;
        }

        const task = this.tasks.splice(0, 1)[0];

        this.startTask(task.task)
            .then(task.onComplete)
            .catch(task.onError);
    }

    addTask = (task) => {
        return new Promise((resolve, reject) => {
            const t = {
                task:       task,
                onComplete: (res) => {
                    resolve(res);
                },
                onError:    reject
            };

            this.tasks.push(t);
        });
    }

    start = () => {
        this.timer = setInterval(() => this.checkTasks(), this.period);
    }

    stop = () => {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    resume = (force = false) => {
        if (this.timer) {
            if (force)
                this.stop()
            else
                return;
        }

        this.start();
    }
}