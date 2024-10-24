import {Webhook} from 'svix'
import userModel from '../models/userModel.js'
import razorpay from 'razorpay'
import transactionModel from '../models/transactionModel.js'


//api controller function to manage clerk user with database
//http://localhost:4000/api/user/webhooks
const clerkWebHooks = async (req,res) => {
    try {
        //create svix instance with clerk webhook secret
        const whook = new Webhook(process.env.CLERK_WEBHOOK_SECRET)
        await whook.verify(JSON.stringify(req.body),{
            "svix-id":req.headers["svix-id"],
            "svix-timestamp":req.headers["svix-timestamp"],
            "svix-signature":req.headers["svix-signature"]
        })

        const {data,type} = req.body

        switch (type) {
            case 'user.created': {
                try {
                    const userData = {
                        clerkId: data.id,
                        email: data.email_addresses[0].email_address,
                        firstName: data.first_name,
                        lastName: data.last_name,
                        photo: data.image_url,
                    };
                    await userModel.create(userData);
                    res.json({ success: true });
                } catch (dbError) {
                    console.error("Veritabanı Hatası:", dbError);
                    res.status(500).json({ success: false, message: "Veritabanı kaydı yapılamadı." });
                }
                break;
            }
            case 'user.updated':{
                const userData = {
                    email:data.email_addresses[0].email_address,
                    firstName:data.first_name,
                    lastName:data.last_name,
                    photo:data.image_url
                }
                await userModel.findOneAndUpdate({clerkId:data.id},userData)
                res.json({})
                break;
            }
            case 'user.deleted':{
                await userModel.findOneAndDelete({clerkId:data.id})
                res.json({})
                break;
            }
                
        
            default:
                res.status(400).json({ success: false, message: "Bilinmeyen event türü." });
                break;
        }

    } catch (error) {
        console.error("Webhook Hatası:", error); // Hata detayını günlüğe kaydet
        res.status(400).json({ success: false, message: error.message }); // Hata durumu 400
    }
}


//api controller function to get user available credits data
const userCredits = async (req, res) => {
    try {
        const { clerkId } = req.body;
        const userData = await userModel.findOne({ clerkId });
        
        if (!userData) {
            return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
        }
        
        res.json({ success: true, credits: userData.creditBalance });
    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

//gateway initialize
const razorpayInstance = new razorpay({
    key_id:process.env.RAZORPAY_KEY_ID,
    key_secret:process.env.RAZORPAY_KEY_SECRET,
})

//api to make payment for credits
const paymentRazorpay = async (req,res) => {
    try {
        const {clerkId,planId} = req.body
        const userData = await userModel.findOne({clerkId})
        if (!userData || !planId) {
            return res.json({success:false,message:'invalid credentials'})
        }
        let credits, plan,amount,date

        switch (planId) {
            case 'Basic':
                plan='Basic'
                credits=100
                amount=10
                break;

             case 'Advanced':
                plan='Advanced'
                credits=500
                amount=50
                break;
            
            case 'Business':
                plan='Business'
                credits=5000
                amount=250
                break;    
        
            default:
                break;
        }

        date = Date.now()
        //creating transaction
        const transactionData = {
            clerkId,
            plan,
            amount,
            credits,
            date
        }
        const newTransaction = await transactionModel.create(transactionData)
        const options = {
            amount:amount*100,
            currency:process.env.CURRENCY,
            receipt: newTransaction._id
        }
        await razorpayInstance.orders.create(options,(error,order)=>{
            if (error) {
                res.json({success:false,message:error})
            }
            res.json({success:true,order})
        })
    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}

//api controller function to verify razorpay payment
const verifyRazorpay = async (req,res) => {
    try {
        const {razorpay_order_id} = req.body
        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)

        if (orderInfo.status==='paid') {
            const transactionData = await transactionModel.findById(orderInfo.receipt)
            if (transactionData.payment) {
                return res.json({success:false,message:'Payment Failed'})
            }
            //adding credits in user data
            const userData = await userModel.findOne({clerkId:transactionData.clerkId})
            const creditBalance = userData.creditBalance + transactionData.credits
            await userModel.findByIdAndUpdate(user._id,{creditBalance})

            //making the payment true
            await transactionModel.findByIdAndUpdate(transactionData._id,{payment:true})

            res.json({success:true,message:'Credits added'})
        }
    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}

export {clerkWebHooks,userCredits,paymentRazorpay,verifyRazorpay}