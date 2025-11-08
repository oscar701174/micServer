import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import videoRouter from './video/video.route.js';

class HlsServer {
    public app: express.Application;

    constructor() {
        const app = express();
        this.app = app;
    }

    private setupRoutes() {
        this.app.use('/video', videoRouter);
    }

    private setupMiddleware() {
        this.app.use(morgan('dev'));
        this.app.use(cors());
        this.app.use((req, res, next) => {
            console.log("this is a middleware log");
            next();
        });
        this.setupRoutes();
        this.app.use(express.json());
        // this.app.use((req,res,next) => {
        //     console.log('this is a middleware error');
        //     res.send({error:"middleware error"});
        // });
    }

    public listen(port: number) {
        this.setupMiddleware();
        this.app.get('/', (req, res) => {
            res.send('HLS Server is running successfully!');
        });
        this.app.listen(port, () => {
            console.log(`HLS Server is running on http://localhost:${port}`);
        });
    }
}

function init() {
    const server = new HlsServer();
    server.listen(8080);
}

init();













