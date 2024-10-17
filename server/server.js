import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import connectDB from './configs/mongodb.js'

//app config
const PORT = process.env.PORT || 4000
const app = express()
await connectDB()

//initialize middlewares
app.use(express.json())
app.use(cors())


//api route
app.get('/',(req,res)=>res.send('API WORKING'))

app.listen(PORT,()=>console.log('Server running on port'+PORT))