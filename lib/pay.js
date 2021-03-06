﻿var network = require('./network');
var util = require('./util');
module.exports = new (function () {
    var self = this;
    var me = {};
    me.verify = function (merchant, data) {
        if (!data.sign) return true;
        var sign = data.sign;
        delete data.sign;
        var tsign = self.sign(merchant, data);
        data.sign = sign;
        return sign === tsign;
    };
    //统一下单接口
    this.unifiedorder = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/pay/unifiedorder';
        var data = {
            appid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            nonce_str: util.getNonce(),
            sign_type: 'MD5',
            notify_url: wxconfig.wxnotifyUrl,
            spbill_create_ip: order.spbill_create_ip || '8.8.8.8',
            body: order.body,
            out_trade_no: order.out_trade_no,
            total_fee: parseInt(order.total_fee * 100),
            trade_type: order.trade_type
        };
        order.device_info && (data.device_info = order.device_info);
        order.openid && (data.openid = order.openid);
        order.detail && (data.detail = order.detail);
        order.attach && (data.attach = order.attach);
        order.time_start && (data.time_start = order.time_start);
        order.time_expire && (data.time_expire = order.time_expire);
        order.goods_tag && (data.goods_tag = order.goods_tag);
        order.limit_pay && (data.limit_pay = order.limit_pay);

        if (!data.out_trade_no) return { errmsg: 'out_trade_no is empty' };
        if (!data.total_fee) return { errmsg: 'total_fee is empty' };
        if (!data.body) return { errmsg: 'body is empty' };
        var sign = this.sign(wxconfig.merchant, data);
        data.sign = sign;
        var xml = util.toXml(data);
        var r = await network.post(url, xml);
        return await util.toJson(r);
    };
    //js支付
    this.payjs = async (wxconfig, order) => {
        order.trade_type = 'JSAPI';
        var r = await this.unifiedorder(wxconfig, order);
        if (!r.prepay_id) return r;
        var signdata = {
            appId: wxconfig.app.id,
            timeStamp: new Date().getTime(),
            nonceStr: util.getNonce(),
            package: 'prepay_id=' + r.prepay_id,
            signType: 'MD5'
        };
        signdata.paySign = this.sign(wxconfig.merchant, signdata);
        signdata.timestamp = signdata.timeStamp;
        delete signdata.timeStamp;
        delete signdata.appId;
        return signdata;
    };
    //h5支付
    this.payh5 = async (wxconfig, order) => {
        order.trade_type = 'MWEB';
        var r = await this.unifiedorder(wxconfig, order);
        if (!r.mweb_url) return r;
        return r.mweb_url;
    };
    //app支付
    this.payapp = async (wxconfig, order) => {
        order.trade_type = 'APP';
        var r = await this.unifiedorder(wxconfig, order);
        var signdata = {
            appid: wxconfig.app.id,
            partnerid: wxconfig.merchant.id,
            prepayid: r.prepay_id,
            package: 'Sign=WXPay',
            noncestr: util.getNonce(),
            timestamp: new Date().getTime()
        };
        signdata.sign = this.sign(wxconfig.merchant, signdata);
        return signdata;
    };
    //支付签名
    this.sign = function (merchant, params) {
        var temp = util.marshall(params);
        temp += '&key=' + String(merchant.key);
        var crypto = require('crypto');
        var crypt = crypto.createHash('MD5');
        crypt.update(temp, 'utf-8');
        return crypt.digest('hex').toUpperCase();
    };
    //支付回调
    this.notify = async (wxconfig, xml) => {
        var json = await util.toJson(xml);
        return me.verify(wxconfig.merchant, json) ? json : { data: json, errmsg: '签名验证失败' };
    };
    //订单查询
    this.query = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/pay/orderquery';
        var data = {
            appid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            nonce_str: util.getNonce(),
            sign_type: 'MD5'
        };
        order.transaction_id && (data.transaction_id = order.transaction_id);
        order.out_trade_no && (data.out_trade_no = order.out_trade_no);
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.post(url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //订单关闭
    this.closeorder = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/pay/closeorder';
        var data = {
            appid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            nonce_str: util.getNonce(),
            out_trade_no: order.out_trade_no,
            sign_type: 'MD5'
        };
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.post(url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //退款
    this.refund = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/secapi/pay/refund';
        var data = {
            appid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            nonce_str: util.getNonce(),
            out_refund_no: order.out_refund_no,
            total_fee: parseInt(order.total_fee * 100),
            refund_fee: parseInt(order.refund_fee * 100),
            op_user_id: wxconfig.merchant.id,
            sign_type: 'MD5'
        };

        order.device_info && (data.device_info = order.device_info);
        order.transaction_id && (data.transaction_id = order.transaction_id);
        order.out_trade_no && (data.out_trade_no = order.out_trade_no);
        order.refund_fee_type && (data.refund_fee_type = order.refund_fee_type);
        order.refund_account && (data.refund_account = order.refund_account);

        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.sslpost(wxconfig.certificate, url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //查询退款
    this.refundquery = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/pay/refundquery';
        var data = {
            appid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            nonce_str: util.getNonce(),
            sign_type: 'MD5'
        };

        order.device_info && (data.device_info = order.device_info);
        order.transaction_id && (data.transaction_id = order.transaction_id);
        order.out_trade_no && (data.out_trade_no = order.out_trade_no);
        order.out_refund_no && (data.out_refund_no = order.out_refund_no);
        order.refund_id && (data.refund_id = order.refund_id);

        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.post(url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //转账
    this.transfers = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/mmpaymkttransfers/promotion/transfers';
        var data = {
            mch_appid: wxconfig.app.id,
            mchid: wxconfig.merchant.id,
            partner_trade_no: order.out_trade_no,
            openid: order.openid,
            check_name: order.re_user_name ? 'FORCE_CHECK' : 'NO_CHECK',
            amount: parseInt(order.amount * 100),
            desc: order.desc,
            spbill_create_ip: order.spbill_create_ip || '8.8.8.8',
            nonce_str: util.getNonce()
        };
        order.re_user_name && (data.re_user_name = order.re_user_name);
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.sslpost(wxconfig.certificate, url, util.toXml(data));
        return await util.toJson(r);
    };
    //企业付款到银行卡
    this.paybank = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/mmpaysptrans/pay_bank';
        var bank_no = util.resencrypt(wxconfig, order.enc_bank_no);
        var name = util.resencrypt(wxconfig, order.enc_true_name);
        var data = {
            mch_id: wxconfig.merchant.id,
            partner_trade_no: order.partner_trade_no,
            nonce_str: util.getNonce(),
            enc_bank_no: bank_no,
            enc_true_name: name,
            bank_code: order.bank_code,
            amount: parseInt(order.amount * 100),
        };
        order.desc && (data.desc = order.desc);
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.sslpost(wxconfig.certificate, url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //企业付款到银行卡查询
    this.paybankquery = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/mmpaysptrans/query_bank';
        var data = {
            nonce_str: util.getNonce(),
            partner_trade_no: order.partner_trade_no,
            mch_id: wxconfig.merchant.id
        };
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.sslpost(wxconfig.certificate, url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
    //现金红包
    this.sendredpack = async (wxconfig, order) => {
        var url = 'https://api.mch.weixin.qq.com/mmpaymkttransfers/sendredpack';
        var data = {
            nonce_str: util.getNonce(),
            mch_billno: order.mch_billno,
            wxappid: wxconfig.app.id,
            mch_id: wxconfig.merchant.id,
            send_name: order.send_name,
            re_openid: order.openid,
            total_amount: parseInt(order.total_amount * 100),
            total_num: 1,
            wishing: order.wishing,
            client_ip: order.client_ip || '8.8.8.8',
            act_name: order.act_name,
            remark: order.remark
        };
        data.sign = this.sign(wxconfig.merchant, data);
        var r = await network.sslpost(wxconfig.certificate, url, util.toXml(data));
        r = await util.toJson(r);
        return me.verify(wxconfig.merchant, r) ? r : { data: r, errmsg: '签名验证失败' };
    };
})();